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

            // Setup Selection Listener (Custom for Simulator/Future Feature)
            this.setupSelectionListener();

        } catch (error) {
            console.error('[InjectMerges] Error executing use case:', error);
        }
    }

    private setupSelectionListener() {
        const editor = this.logseqApi.Editor as any;
        if (typeof editor.onBlockSelected === 'function') {
            console.log('[InjectMerges] Setting up onBlockSelected listener');
            editor.onBlockSelected(async (block: any) => {
                if (block && block.uuid) {
                    // Check if is a valid merge block
                    if (this.validMergeUuidsCache.has(block.uuid)) {
                        await this.injectForBlock(block.uuid);
                    } else {
                        // Optional: Check if the block has the property but wasn't in our initial DB query (e.g. newly created)
                        // For now, adhere to the cache. 
                        // But strictly complying to "check if it has the merge property":
                        if (block.properties && (block.properties['logseq-doc-agent.merge'] || block.properties['logseqDocAgent.merge'])) {
                            this.validMergeUuidsCache.add(block.uuid);
                            await this.injectForBlock(block.uuid);
                        }
                    }
                }
            });
        }
    }

    private async injectForBlock(uuid: string) {
        // Reuse logic? Or simplified injection for single block
        // We can just call injectFromCache but optimization:
        console.log(`[InjectMerges] Triggering injection for selected block ${uuid}`);

        const elements = this.componentInjector.findBlockElements([uuid]);
        if (elements.length > 0) {
            // We can reuse the loop logic from injectFromCache by making it reusable or just copy specific logic
            // Let's extract the injection logic for a list of elements
            await this.injectElements(elements);
        } else {
            console.warn(`[InjectMerges] Selected block ${uuid} not found in DOM`);
        }
    }

    private async injectElements(elements: HTMLElement[]) {
        for (const element of elements) {
            // ... logic from injectFromCache ...
            // We need to refactor injectFromCache to call this or duplicate slightly.
            // Refactoring is cleaner.
            await this.processMergeElement(element);
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

            await this.injectElements(mergeElements);
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

    private async processMergeElement(element: HTMLElement) {
        try {
            const blockId = this.componentInjector.getBlockIdFromElement(element);
            if (!blockId) return;

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
                return;
            }

            // Fetch block to get both properties and content
            // We need content for inline diffs (Tier 2)
            const block = await this.logseqApi.Editor.getBlock(blockId);

            if (block && block.properties) {
                const propVal = block.properties['logseq-doc-agent.merge'] || block.properties['logseqDocAgent.merge'];

                if (propVal) {
                    let mergeData: MergeEntity;
                    if (typeof propVal === 'string') {
                        try {
                            mergeData = JSON.parse(propVal);
                        } catch (e) {
                            // If parse fails, maybe it's just a raw string, but usually it's JSON
                            console.warn(`[InjectMerges] Failed to parse merge content for block ${blockId}`);
                            return;
                        }
                    } else {
                        mergeData = propVal as any;
                    }

                    // Populate currentContent for diffing
                    if (block.content) {
                        // Naively strip the merge property line to avoid self-diffing
                        const lines = block.content.split('\n');
                        const cleanContent = lines.filter(l => !l.includes('logseq-doc-agent.merge::')).join('\n').trim();
                        mergeData.currentContent = cleanContent;
                    }

                    this.doInject(element, blockId, mergeData);
                }
            }

        } catch (e) {
            console.error('[InjectMerges] Error processing element:', e);
        }
    }

    private doInject(element: HTMLElement, blockId: string, mergeData: MergeEntity) {
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
    }
}
