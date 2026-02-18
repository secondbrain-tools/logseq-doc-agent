import type { ComponentInjector, LogseqApi, StyleInjector } from '../ports';
import { InjectionPosition } from '../../domain/logseq';
import MergeControls from '../../ui/components/merge/MergeControls.svelte';
import PageMergeToolbar from '../../ui/components/merge/PageMergeToolbar.svelte';
import type { MergeEntity } from '../../domain/merge/entity';
import { mount, unmount } from 'svelte';
import { MergeState } from './merge-state.svelte';

const TOOLBAR_CONTAINER_ID = 'lda-merge-toolbar-slot';

export class InjectMergesUseCase {
    private pageToolbarApp: any = null;
    private pageToolbarRegistered: boolean = false;
    private validMergeUuidsCache: Set<string> = new Set();
    private observer: MutationObserver | null = null;
    private observerDebounceTimer: any = null;
    private mergeState: MergeState | null = null;

    constructor(
        private componentInjector: ComponentInjector,
        private logseqApi: LogseqApi
    ) { }

    public dispose() {
        console.log('[InjectMergesUseCase] Disposing...');
        // We do NOT want to remove the page toolbar on dispose of the usecase if it's a singleton service 
        // effectively. But if the plugin reloads, we do.
        // For now, let's keep behavior: hide/remove it.
        this.removePageToolbar();

        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.observerDebounceTimer) {
            clearTimeout(this.observerDebounceTimer);
        }

        if ('dispose' in this.componentInjector) {
            (this.componentInjector as any).dispose();
        }
    }

    /**
     * Register the pagebar item once at plugin startup.
     * This creates a placeholder div where we can mount/unmount the Svelte component.
     */
    public registerPagebarItem() {
        if (this.pageToolbarRegistered) return;

        console.log('[InjectMerges] Registering pagebar item...');

        // Register a placeholder for the merge toolbar in the global toolbar
        logseq.App.registerUIItem('toolbar', {
            key: 'lda-merge-toolbar',
            template: `<div id="${TOOLBAR_CONTAINER_ID}" style="display: inline-flex; align-items: center;"></div>`,
        });

        this.pageToolbarRegistered = true;
        console.log('[InjectMerges] Pagebar item registered');
    }

    async execute() {
        try {
            // Get current page to scope the query
            const currentPage = await this.logseqApi.getCurrentPage();
            if (!currentPage) {
                console.log('[InjectMerges] No current page found, skipping injection.');
                this.hidePageToolbar(); // This will unmount and reset state, which is correct for switching to a non-page
                return;
            }

            console.log(`[InjectMerges] Current page: ${currentPage.originalName || currentPage.name} (${currentPage.uuid})`);

            // Query DB for accurate merge count on the CURRENT PAGE
            // Using Simple Query syntax as requested by user
            const query = `(and (property :logseq-doc-agent.merge) (page [[${currentPage.originalName || currentPage.name}]]))`;
            console.log(`[InjectMerges] Running query: ${query}`);

            const mergeBlocksFromDb = await this.logseqApi.q(query) || [];
            const dbMergeCount = mergeBlocksFromDb.length;

            console.log(`[InjectMerges] DB query found ${dbMergeCount} blocks with merge property on current page.`);

            // Handle page toolbar based on DB merge count
            if (dbMergeCount === 0) {
                console.log('[InjectMerges] No blocks with pending merges found in DB for this page.');
                this.hidePageToolbar();
            } else {
                // Show/update page toolbar with accurate count from DB
                this.showPageToolbar(dbMergeCount);
            }

            // Build set of valid merge block UUIDs from DB and update cache
            const validMergeUuids = new Set(mergeBlocksFromDb.map((b: any) => b.uuid));
            this.validMergeUuidsCache = validMergeUuids as Set<string>;

            // Cleanup: Remove stale merge controls that no longer have merge property in DB
            this.cleanupStaleMergeControls(this.validMergeUuidsCache);

            // Initial injection
            await this.injectFromCache();

            // Setup Observer for virtualization (scrolling/expanding)
            this.setupObserver();

        } catch (error) {
            console.error('[InjectMerges] Error executing use case:', error);
        }
    }

    private async injectFromCache() {
        try {
            const validUuids = this.validMergeUuidsCache;
            if (validUuids.size === 0) return;

            // Find DOM elements for control injection (query by UUID)
            const uuidArray = Array.from(validUuids);
            const mergeElements = this.componentInjector.findBlockElements(uuidArray);

            // DEBUG: Identify which UUIDs were NOT found in DOM
            if (mergeElements.length < uuidArray.length) {
                const foundUuids = new Set<string>();
                mergeElements.forEach(el => {
                    const id = this.componentInjector.getBlockIdFromElement(el);
                    if (id) foundUuids.add(id);
                });

                const missingUuids = uuidArray.filter(uuid => !foundUuids.has(uuid));
                if (missingUuids.length > 0) {
                    console.warn(`[InjectMerges] WARNING: ${missingUuids.length} blocks from DB were NOT found in DOM!`);
                    console.warn(`[InjectMerges] Missing UUIDs:`, missingUuids);
                }
            }

            for (const element of mergeElements) {
                try {
                    const blockId = this.componentInjector.getBlockIdFromElement(element);
                    if (!blockId) continue;

                    // Fix for Duplicate Detection:
                    // We must check strict scoping. accessing element.querySelector will find controls in CHILDREN blocks
                    // which causes false positives for parent blocks.
                    const mainContainer = element.querySelector('.block-main-container');

                    // Check for existing controls strictly within the intended target
                    // We inject as NextSibling, so check the sibling container
                    let alreadyHasControls = false;
                    if (mainContainer) {
                        const siblingContainer = mainContainer.nextElementSibling;
                        if (siblingContainer?.classList.contains('feedback-rating-container')) {
                            if (siblingContainer.querySelector('.lda-merge-controls')) {
                                alreadyHasControls = true;
                            }
                        }
                    } else {
                        // Fallback for non-standard blocks?
                        if (element.querySelector(':scope > .feedback-rating-container .lda-merge-controls')) {
                            // Use :scope to limit to direct children
                            alreadyHasControls = true;
                        }
                    }

                    if (alreadyHasControls) {
                        console.log(`[InjectMerges] Skipping ${blockId}: Controls already present (Scoped Check)`);
                        continue;
                    }

                    // Fetch the property content to confirm validity and get data
                    // console.log(`[InjectMerges] Fetching property for ${blockId}...`);
                    const rawContent = await this.logseqApi.Editor.getBlockPropertyContent(blockId, 'logseq-doc-agent.merge');

                    if (rawContent) {
                        let mergeData: MergeEntity;
                        try {
                            mergeData = JSON.parse(rawContent);
                        } catch (e) {
                            console.warn(`[InjectMerges] Failed to parse merge content for block ${blockId}: ${rawContent}`);
                            continue;
                        }

                        // Inject the component
                        const mainContainer = element.querySelector('.block-main-container');
                        if (mainContainer) {
                            // console.log(`[InjectMerges] Injecting into .block-main-container for ${blockId}`);
                            this.componentInjector.injectComponentWithPosition(
                                mainContainer as HTMLElement,
                                MergeControls,
                                InjectionPosition.NextSibling,
                                {
                                    blockUuid: blockId,
                                    mergeData: mergeData
                                }
                            );
                        } else {
                            // Fallback to old behavior
                            console.log(`[InjectMerges] Fallback strategy for ${blockId}`);
                            this.componentInjector.injectComponentWithPosition(
                                element,
                                MergeControls,
                                InjectionPosition.LastChild,
                                {
                                    blockUuid: blockId,
                                    mergeData: mergeData
                                }
                            );
                        }
                    } else {
                        console.warn(`[InjectMerges] Aborting ${blockId}: getBlockPropertyContent returned null/empty.`);
                        // Attempt fallback fetch via full block details
                        try {
                            const blockFn = await this.logseqApi.Editor.getBlock(blockId);
                            if (blockFn && blockFn.properties && blockFn.properties['logseq-doc-agent.merge']) {
                                console.log(`[InjectMerges] RECOVERY: Found property in block object for ${blockId}`);
                                // We have the property, but it might be an object already or string
                                const propVal = blockFn.properties['logseq-doc-agent.merge'];
                                // Logseq properties can be pre-parsed objects if they are valid JSON? Or still strings?
                                // Usually valid JSON in properties is stored as string in DB, but returned as parsed object by getBlock?.
                                // Let's assume we need to handle both
                                let mergeData: MergeEntity;
                                if (typeof propVal === 'string') {
                                    mergeData = JSON.parse(propVal);
                                } else {
                                    mergeData = propVal;
                                }

                                // Retry injection
                                const mainContainer = element.querySelector('.block-main-container');
                                if (mainContainer) {
                                    this.componentInjector.injectComponentWithPosition(
                                        mainContainer as HTMLElement,
                                        MergeControls,
                                        InjectionPosition.NextSibling,
                                        {
                                            blockUuid: blockId,
                                            mergeData: mergeData
                                        }
                                    );
                                }
                            }
                        } catch (ex) {
                            console.error(`[InjectMerges] Recovery failed for ${blockId}`, ex);
                        }
                    }

                } catch (e) {
                    console.error('[InjectMerges] Error processing element:', e);
                }
            }
        } catch (e) {
            console.error('[InjectMerges] Error in injectFromCache:', e);
        }
    }

    private setupObserver() {
        if (this.observer) return;

        const doc = (window as any).parent?.document || document;
        // Watch the app container or body for virtualization changes
        const mainContainer = doc.getElementById('app-container') || doc.body;

        if (!mainContainer) {
            console.warn('[InjectMerges] Could not find main container for observer');
            return;
        }

        console.log('[InjectMerges] Setting up MutationObserver for virtualization support');

        this.observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const mutation of mutations) {
                // Check if nodes were added
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldUpdate = true;
                    break;
                }
            }

            if (shouldUpdate) {
                // Debounce injection to avoid performance hit on rapid scroll
                if (this.observerDebounceTimer) clearTimeout(this.observerDebounceTimer);
                this.observerDebounceTimer = setTimeout(() => {
                    this.injectFromCache();
                }, 200);
            }
        });

        this.observer.observe(mainContainer, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Remove merge control injections for blocks that no longer have merge property
     */
    private cleanupStaleMergeControls(validMergeUuids: Set<string>) {
        const doc = (window as any).parent?.document || document;

        // Find all injected merge controls
        const allMergeControls = doc.querySelectorAll('.lda-merge-controls');
        console.log(`[InjectMerges] Cleanup: Found ${allMergeControls.length} existing merge controls`);

        allMergeControls.forEach((control: HTMLElement) => {
            // Find the parent block element
            const blockElement = control.closest('[blockid]');
            if (blockElement) {
                const blockId = blockElement.getAttribute('blockid');
                if (blockId && !validMergeUuids.has(blockId)) {
                    console.log(`[InjectMerges] Removing stale merge control for block ${blockId}`);
                    // Remove the control via injector to trigger unmount/onDestroy
                    const container = control.closest('.feedback-rating-container') as HTMLElement;
                    if (container) {
                        this.componentInjector.removeComponent(container);
                    } else {
                        // Fallback if container structure is unexpected
                        control.remove();
                    }
                }
            }
        });
    }

    private getToolbarContainer(): HTMLElement | null {
        // Try parent document first (Logseq iframe context), then local document (simulator)
        const parentDoc = (window as any).parent?.document;
        const container = parentDoc?.getElementById(TOOLBAR_CONTAINER_ID)
            || document.getElementById(TOOLBAR_CONTAINER_ID);
        return container;
    }

    private showPageToolbar(mergeCount: number) {
        console.log('[InjectMerges] showPageToolbar called with count:', mergeCount);

        const container = this.getToolbarContainer();

        if (!container) {
            console.warn('[InjectMerges] Toolbar container not found, will retry...');
            // Retry after a short delay (registerUIItem may still be processing)
            setTimeout(() => this.showPageToolbar(mergeCount), 200);
            return;
        }

        // Show the container
        container.style.display = 'block';

        // Check if we already have the app mounted
        if (!this.pageToolbarApp) {
            console.log('[InjectMerges] Mounting Page Toolbar App');
            // Create shared state
            this.mergeState = new MergeState(mergeCount);

            this.pageToolbarApp = mount(PageMergeToolbar, {
                target: container,
                props: {
                    mergeState: this.mergeState
                }
            });
        } else {
            // Update state
            console.log('[InjectMerges] Updating Page Toolbar State');
            if (this.mergeState) {
                this.mergeState.updateCount(mergeCount);
            }
        }

        console.log(`[InjectMerges] Page toolbar shown with ${mergeCount} pending merges`);
    }

    private hidePageToolbar() {
        const container = this.getToolbarContainer();

        if (this.pageToolbarApp) {
            unmount(this.pageToolbarApp);
            this.pageToolbarApp = null;
            this.mergeState = null;
        }

        if (container) {
            container.style.display = 'none';
            container.innerHTML = ''; // Clear content
        }

        console.log('[InjectMerges] Page toolbar hidden');
    }

    private removePageToolbar() {
        this.hidePageToolbar();
    }
}
