import type { ComponentInjector, LogseqApi, StyleInjector } from '../ports';
import { InjectionPosition } from '../../domain/logseq';
import MergeControls from '../../ui/components/merge/MergeControls.svelte';
import PageMergeToolbar from '../../ui/components/merge/PageMergeToolbar.svelte';
import type { MergeEntity } from '../../domain/merge/entity';
import { mount, unmount } from 'svelte';

const TOOLBAR_CONTAINER_ID = 'lda-merge-toolbar-slot';

export class InjectMergesUseCase {
    private pageToolbarApp: any = null;
    private pageToolbarRegistered: boolean = false;

    constructor(
        private componentInjector: ComponentInjector,
        private logseqApi: LogseqApi
    ) { }

    public dispose() {
        console.log('[InjectMergesUseCase] Disposing...');
        this.removePageToolbar();
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
            template: `<div id="${TOOLBAR_CONTAINER_ID}"></div>`
        });

        this.pageToolbarRegistered = true;
        console.log('[InjectMerges] Pagebar item registered');
    }

    async execute() {
        try {
            // Query DB for accurate merge count (DOM may be stale)
            const mergeBlocksFromDb = await this.logseqApi.q('(property :logseq-doc-agent.merge)') || [];
            const dbMergeCount = mergeBlocksFromDb.length;

            console.log(`[InjectMerges] DB query found ${dbMergeCount} blocks with merge property.`);

            // Handle page toolbar based on DB merge count
            if (dbMergeCount === 0) {
                console.log('[InjectMerges] No blocks with pending merges found in DB.');
                this.hidePageToolbar();
            } else {
                // Show/update page toolbar with accurate count from DB
                this.showPageToolbar(dbMergeCount);
            }

            // Build set of valid merge block UUIDs from DB
            const validMergeUuids = new Set(mergeBlocksFromDb.map((b: any) => b.uuid));

            // Cleanup: Remove stale merge controls that no longer have merge property in DB
            this.cleanupStaleMergeControls(validMergeUuids);

            // Find DOM elements for control injection (may lag behind DB)
            const mergeElements = this.componentInjector.findBlockElementsWithProperty('logseq-doc-agent.merge');
            console.log(`[InjectMerges] DOM found ${mergeElements.length} blocks with pending merges.`);

            for (const element of mergeElements) {
                try {
                    const blockId = this.componentInjector.getBlockIdFromElement(element);
                    if (!blockId) continue;

                    // Skip if this block is not in DB anymore (stale DOM)
                    if (!validMergeUuids.has(blockId)) {
                        console.log(`[InjectMerges] Block ${blockId} not in DB, skipping injection`);
                        continue;
                    }

                    // Avoid duplicate injections
                    if (element.querySelector('.lda-merge-controls')) {
                        console.log(`[InjectMerges] Controls already present for block ${blockId}`);
                        continue;
                    }

                    // Fetch the property content to confirm validity and get data
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
                        this.componentInjector.injectComponentWithPosition(
                            element,
                            MergeControls,
                            InjectionPosition.LastChild,
                            {
                                blockUuid: blockId,
                                mergeData: mergeData
                            }
                        );
                        console.log(`[InjectMerges] Injected controls for block ${blockId}`);
                    }

                } catch (e) {
                    console.error('[InjectMerges] Error processing element:', e);
                }
            }

        } catch (error) {
            console.error('[InjectMerges] Error executing use case:', error);
        }
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

        // Mount or remount the component with updated count
        if (this.pageToolbarApp) {
            unmount(this.pageToolbarApp);
        }

        this.pageToolbarApp = mount(PageMergeToolbar, {
            target: container,
            props: {
                mergeCount: mergeCount
            }
        });

        console.log(`[InjectMerges] Page toolbar shown with ${mergeCount} pending merges`);
    }

    private hidePageToolbar() {
        const container = this.getToolbarContainer();

        if (this.pageToolbarApp) {
            unmount(this.pageToolbarApp);
            this.pageToolbarApp = null;
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
