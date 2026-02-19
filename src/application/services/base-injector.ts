import type { ComponentInjector, LogseqApi } from '../ports';
import { InjectionPosition } from '../../domain/logseq';

export interface InjectionConfig {
    position: InjectionPosition;
    containerClass?: string; // Optional class for the injected container
    targetSelector?: string; // e.g. '.block-main-container'
}

export abstract class BaseBlockInjector<TData> {
    protected validUuidsCache: Set<string> = new Set();
    protected observer: MutationObserver | null = null;
    protected observerDebounceTimer: any = null;

    constructor(
        protected componentInjector: ComponentInjector,
        protected logseqApi: LogseqApi,
        protected logPrefix: string
    ) { }

    protected abstract getInjectionConfig(): InjectionConfig;
    protected abstract getComponent(): any;
    protected abstract parseProperty(content: string, blockId: string): TData | null;
    protected abstract getComponentProps(blockId: string, data: TData): any;
    protected abstract getQuery(currentPage: any): string;

    /**
     * Executes the injection process
     */
    public async execute() {
        try {
            // Get current page to scope the query
            const currentPage = await this.logseqApi.getCurrentPage();
            if (!currentPage) {
                console.log(`[${this.logPrefix}] No current page found, skipping injection.`);
                this.handleNoPage();
                return;
            }

            console.log(`[${this.logPrefix}] Current page: ${currentPage.originalName || currentPage.name} (${currentPage.uuid})`);

            // Query DB
            const query = this.getQuery(currentPage);
            console.log(`[${this.logPrefix}] Running query: ${query}`);

            const blocksFromDb = await this.logseqApi.q(query) || [];
            const count = blocksFromDb.length;

            console.log(`[${this.logPrefix}] DB query found ${count} blocks.`);

            this.handleQueryResults(count, blocksFromDb);

            // Build set of valid block UUIDs from DB and update cache
            const validUuids = new Set(blocksFromDb.map((b: any) => b.uuid));
            this.validUuidsCache = validUuids as Set<string>;

            // Cleanup stale controls
            this.cleanupStaleControls(this.validUuidsCache);

            // Initial injection
            await this.injectFromCache();

            // Setup Observer for virtualization
            this.setupObserver();

        } catch (error) {
            console.error(`[${this.logPrefix}] Error executing injector:`, error);
        }
    }

    public dispose() {
        console.log(`[${this.logPrefix}] Disposing...`);
        this.onDispose();

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

    protected handleNoPage() { }
    protected handleQueryResults(count: number, blocks: any[]) { }
    protected onDispose() { }

    protected async injectFromCache() {
        try {
            const validUuids = this.validUuidsCache;
            if (validUuids.size === 0) return;

            // Find DOM elements for control injection (query by UUID)
            const uuidArray = Array.from(validUuids);
            const elements = this.componentInjector.findBlockElements(uuidArray);

            // DEBUG: Identify which UUIDs were NOT found in DOM
            if (elements.length < uuidArray.length) {
                const foundUuids = new Set<string>();
                elements.forEach(el => {
                    const id = this.componentInjector.getBlockIdFromElement(el);
                    if (id) foundUuids.add(id);
                });

                const missingUuids = uuidArray.filter(uuid => !foundUuids.has(uuid));
                if (missingUuids.length > 0) {
                    // Only warn if significant count or excessive debugging needed
                    // console.warn(`[${this.logPrefix}] WARNING: ${missingUuids.length} blocks from DB were NOT found in DOM.`);
                }
            }

            for (const element of elements) {
                try {
                    const blockId = this.componentInjector.getBlockIdFromElement(element);
                    if (!blockId) continue;

                    const config = this.getInjectionConfig();

                    // Determine injection target (default to element, but prefer config.targetSelector)
                    let targetElement = element;

                    if (config.targetSelector) {
                        const targetContainer = element.querySelector(config.targetSelector);
                        if (targetContainer) {
                            targetElement = targetContainer as HTMLElement;
                        } else {
                            // Strict behavior: if target selector is specified but not found, skip injection
                            console.warn(`[${this.logPrefix}] Skipping ${blockId}: Target selector ${config.targetSelector} not found.`);
                            continue;
                        }
                    }

                    // Scoped Duplicate Detection
                    // Since components might not have consistent classes yet, we can check for a data attribute or class
                    // For now, let's assume valid injection adds a certain class or we check for the component container class
                    if (this.checkForExistingInjection(targetElement)) {
                        console.log(`[${this.logPrefix}] Skipping ${blockId}: Injected component already present`);
                        continue;
                    }


                    // Fetch Property
                    // console.log(`[${this.logPrefix}] Fetching property for ${blockId}...`);
                    const propertyName = this.getPropertyName();
                    const rawContent = await this.logseqApi.Editor.getBlockPropertyContent(blockId, propertyName);

                    let data: TData | null = null;

                    if (rawContent) {
                        data = this.parseProperty(rawContent, blockId);
                    } else {
                        console.warn(`[${this.logPrefix}] Property ${propertyName} not found or empty for ${blockId}.`);
                        // No fallback to getBlock() as it masks issues
                    }

                    if (data) {
                        const props = this.getComponentProps(blockId, data);

                        const container = this.componentInjector.injectComponentWithPosition(
                            targetElement,
                            this.getComponent(),
                            config.position,
                            props
                        );

                        // Add identifier class for duplicate detection if needed
                        if (config.containerClass) {
                            container.classList.add(config.containerClass);
                        }

                        // console.log(`[${this.logPrefix}] Successfully injected for block ${blockId}`);
                    }

                } catch (e) {
                    console.error(`[${this.logPrefix}] Error processing element:`, e);
                }
            }
        } catch (e) {
            console.error(`[${this.logPrefix}] Error in injectFromCache:`, e);
        }
    }

    protected setupObserver() {
        if (this.observer) return;

        const doc = (window as any).parent?.document || document;
        const mainContainer = doc.getElementById('app-container') || doc.body;

        if (!mainContainer) {
            console.warn(`[${this.logPrefix}] Could not find main container for observer`);
            return;
        }

        console.log(`[${this.logPrefix}] Setting up MutationObserver`);

        this.observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldUpdate = true;
                    break;
                }
            }

            if (shouldUpdate) {
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

    protected cleanupStaleControls(validUuids: Set<string>) {
        const doc = (window as any).parent?.document || document;
        const selector = this.getComponentSelector();

        // Dynamic container class check
        const config = this.getInjectionConfig();
        const containerClass = config.containerClass;

        if (!selector) return;

        const allControls = doc.querySelectorAll(selector);
        // console.log(`[${this.logPrefix}] Cleanup: Found ${allControls.length} existing controls`);

        allControls.forEach((control: HTMLElement) => {
            const blockElement = control.closest('[blockid]');
            if (blockElement) {
                const blockId = blockElement.getAttribute('blockid');
                if (blockId && !validUuids.has(blockId)) {
                    console.log(`[${this.logPrefix}] Removing stale control for block ${blockId}`);

                    // Try to find container using configured class if available
                    let container: HTMLElement | null = null;

                    if (containerClass) {
                        container = control.closest(`.${containerClass}`) as HTMLElement;
                    }

                    // Fallback to parent if no container class or not found (though structure should be consistent)
                    if (!container) {
                        container = control.parentElement;
                    }

                    if (container && 'removeComponent' in this.componentInjector) {
                        this.componentInjector.removeComponent(container);
                    } else {
                        control.remove();
                    }
                }
            }
        });
    }

    protected abstract getPropertyName(): string;

    // Selector to find the injected component (e.g. '.lda-merge-controls')
    protected abstract getComponentSelector(): string;

    // Check if the current target element already has the component
    protected checkForExistingInjection(target: HTMLElement): boolean {
        const selector = this.getComponentSelector();
        return !!target.querySelector(selector);
    }

    // For specific class based checks if needed
    protected getComponentClassIdentifier(): string {
        return '';
    }
}
