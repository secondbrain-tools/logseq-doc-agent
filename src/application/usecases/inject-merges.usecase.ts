import type { ComponentInjector, LogseqApi, StyleInjector } from '../ports';
import { InjectionPosition } from '../../domain/logseq';
import MergeControls from '../../ui/components/merge/MergeControls.svelte';
import PageMergeToolbar from '../../ui/components/merge/PageMergeToolbar.svelte';
import type { MergeEntity } from '../../domain/merge/entity';
import { mount, unmount } from 'svelte';

export class InjectMergesUseCase {
    private pageToolbarApp: any = null;
    private pageToolbarContainer: HTMLElement | null = null;

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

    async execute() {
        try {
            // Find all blocks with the merge property
            const mergeElements = this.componentInjector.findBlockElementsWithProperty('logseq-doc-agent.merge');

            // Handle page toolbar based on merge count
            if (mergeElements.length === 0) {
                console.log('[InjectMerges] No blocks with pending merges found.');
                this.removePageToolbar();
                return;
            }

            console.log(`[InjectMerges] Found ${mergeElements.length} blocks with pending merges.`);

            // Inject or update page toolbar
            this.injectPageToolbar(mergeElements.length);

            for (const element of mergeElements) {
                try {
                    const blockId = this.componentInjector.getBlockIdFromElement(element);
                    if (!blockId) continue;

                    // Avoid duplicate injections
                    if (element.querySelector('.lda-merge-controls')) {
                        console.log(`[InjectMerges] Controls already present for block ${blockId}`);
                        continue;
                    }

                    // Fetch the property content to confirm validity and get data
                    // Note: 'logseq_doc_agent.merge' property name
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

    private injectPageToolbar(mergeCount: number) {
        // Find the page header/toolbar area
        const doc = (window as any).parent?.document || document;
        const pageHeader = doc.querySelector('.page-title') ||
            doc.querySelector('.ls-page-title') ||
            doc.querySelector('.page-blocks-inner')?.parentElement;

        if (!pageHeader) {
            console.warn('[InjectMerges] No page header found for toolbar injection');
            return;
        }

        // Check if container already exists
        if (!this.pageToolbarContainer) {
            this.pageToolbarContainer = doc.createElement('div') as HTMLElement;
            this.pageToolbarContainer.id = 'lda-page-merge-toolbar-container';
            this.pageToolbarContainer.style.marginBottom = '8px';

            // Insert after page title
            const pageTitle = doc.querySelector('.page-title') || doc.querySelector('.ls-page-title');
            if (pageTitle?.parentElement) {
                pageTitle.parentElement.insertBefore(this.pageToolbarContainer, pageTitle.nextSibling);
            } else {
                pageHeader.prepend(this.pageToolbarContainer);
            }
        }

        // Mount or remount the component with updated count
        if (this.pageToolbarApp) {
            unmount(this.pageToolbarApp);
        }

        if (this.pageToolbarContainer) {
            this.pageToolbarApp = mount(PageMergeToolbar, {
                target: this.pageToolbarContainer,
                props: {
                    mergeCount: mergeCount
                }
            });
        }

        console.log(`[InjectMerges] Page toolbar injected with ${mergeCount} pending merges`);
    }

    private removePageToolbar() {
        if (this.pageToolbarApp) {
            unmount(this.pageToolbarApp);
            this.pageToolbarApp = null;
        }
        if (this.pageToolbarContainer) {
            this.pageToolbarContainer.remove();
            this.pageToolbarContainer = null;
        }
        console.log('[InjectMerges] Page toolbar removed');
    }
}

