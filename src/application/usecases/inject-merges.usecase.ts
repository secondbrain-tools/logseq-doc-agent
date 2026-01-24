import type { ComponentInjector, LogseqApi, StyleInjector } from '../ports';
import { InjectionPosition } from '../../domain/logseq';
import MergeControls from '../../ui/components/merge/MergeControls.svelte';
import type { MergeEntity } from '../../domain/merge/entity';

export class InjectMergesUseCase {
    constructor(
        private componentInjector: ComponentInjector,
        private logseqApi: LogseqApi
    ) { }

    async execute() {
        try {
            // Find all blocks with the merge property
            const mergeElements = this.componentInjector.findBlockElementsWithProperty('logseq-doc-agent.merge');

            if (mergeElements.length === 0) {
                console.log('[InjectMerges] No blocks with pending merges found.');
                return;
            }

            console.log(`[InjectMerges] Found ${mergeElements.length} blocks with pending merges.`);

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
                    const rawContent = await this.logseqApi.Editor.getBlockPropertyContent(blockId, 'logseq_doc_agent.merge');

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
}
