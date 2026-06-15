import type { ComponentInjector, LogseqApi, StyleInjector } from "../ports";
import { InjectionPosition } from "../../domain/logseq";
import MergeControls from "../../ui/components/merge/MergeControls.svelte";
import PageMergeToolbar from "../../ui/components/merge/PageMergeToolbar.svelte";
import type { MergeEntity } from "../../domain/merge/entity";
import { mount, unmount } from "svelte";
import { MergeState } from "./merge-state.svelte";
import { LDA_MERGE_PROPERTY, LDA_MERGE_PROPERTY_CAMEL } from "../../domain/logseq/properties";

const TOOLBAR_CONTAINER_ID = "lda-merge-toolbar-slot";

export class InjectMergesUseCase {
  private pageToolbarApp: any = null;
  private pageToolbarRegistered: boolean = false;
  private validMergeUuidsCache: Set<string> = new Set();
  private observer: MutationObserver | null = null;
  private observerDebounceTimer: any = null;
  private mergeState: MergeState | null = null;

  constructor(
    private componentInjector: ComponentInjector,
    private logseqApi: LogseqApi,
  ) {}

  public dispose() {
    // We do NOT want to remove the page toolbar on dispose of the usecase if it's a singleton service
    // effectively. But if the plugin reloads, we do.
    this.hidePageToolbar();

    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.observerDebounceTimer) {
      clearTimeout(this.observerDebounceTimer);
    }

    if ("dispose" in this.componentInjector) {
      (this.componentInjector as any).dispose();
    }
  }

  /**
   * Register the pagebar item once at plugin startup.
   * This creates a placeholder div where we can mount/unmount the Svelte component.
   */
  public registerPagebarItem() {
    if (this.pageToolbarRegistered) return;

    // Register a placeholder for the merge toolbar in the global toolbar
    this.logseqApi.registerUIItem("toolbar", {
      key: "lda-merge-toolbar",
      template: `<div id="${TOOLBAR_CONTAINER_ID}" style="display: inline-flex; align-items: center;"></div>`,
    });

    this.pageToolbarRegistered = true;
  }

  async execute() {
    try {
      // Get current page to scope the query
      const currentPage = await this.logseqApi.getCurrentPage();
      if (!currentPage) {
        this.hidePageToolbar(); // This will unmount and reset state, which is correct for switching to a non-page
        return;
      }

      // Query DB for accurate merge count on the CURRENT PAGE
      // Using Simple Query syntax as requested by user
      const query = `(and (property :${LDA_MERGE_PROPERTY}) (page [[${currentPage.originalName || currentPage.name}]]))`;

      const mergeBlocksFromDb = (await this.logseqApi.q(query)) || [];
      const dbMergeCount = mergeBlocksFromDb.length;

      // Handle page toolbar based on DB merge count
      if (dbMergeCount === 0) {
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
      console.error("[InjectMerges] Error executing use case:", error);
    }
  }

  private setupSelectionListener() {
    const editor = this.logseqApi.Editor as any;
    if (typeof editor.onBlockSelected === "function") {
      editor.onBlockSelected(async (block: any) => {
        if (block && block.uuid) {
          if (this.validMergeUuidsCache.has(block.uuid)) {
            await this.injectForBlock(block.uuid);
          } else if (this.hasMergeProperty(block)) {
            this.validMergeUuidsCache.add(block.uuid);
            await this.injectForBlock(block.uuid);
          }
        }
      });
    }
  }

  private async injectForBlock(uuid: string) {
    const elements = this.componentInjector.findBlockElements([uuid]);
    if (elements.length > 0) {
      await this.injectElements(elements);
    } else {
      console.warn(`[InjectMerges] Selected block ${uuid} not found in DOM`);
    }
  }

  private async injectElements(elements: HTMLElement[]) {
    for (const element of elements) {
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
        mergeElements.forEach((el) => {
          const id = this.componentInjector.getBlockIdFromElement(el);
          if (id) foundUuids.add(id);
        });

        const missingUuids = uuidArray.filter((uuid) => !foundUuids.has(uuid));
        if (missingUuids.length > 0) {
          console.warn(
            `[InjectMerges] WARNING: ${missingUuids.length} blocks from DB were NOT found in DOM!`,
          );
          console.warn(`[InjectMerges] Missing UUIDs:`, missingUuids);
        }
      }

      await this.injectElements(mergeElements);
    } catch (e) {
      console.error("[InjectMerges] Error in injectFromCache:", e);
    }
  }

  private setupObserver() {
    if (this.observer) return;

    const doc = (window as any).parent?.document || document;
    // Watch the app container or body for virtualization changes
    const mainContainer = doc.getElementById("app-container") || doc.body;

    if (!mainContainer) {
      console.warn("[InjectMerges] Could not find main container for observer");
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      for (const mutation of mutations) {
        // Check if nodes were added
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
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
      subtree: true,
    });
  }

  /**
   * Remove merge control injections for blocks that no longer have merge property
   */
  private cleanupStaleMergeControls(validMergeUuids: Set<string>) {
    const doc = (window as any).parent?.document || document;

    // Find all injected merge controls
    const allMergeControls = doc.querySelectorAll(".lda-merge-controls");

    allMergeControls.forEach((control: HTMLElement) => {
      // Find the parent block element
      const blockElement = control.closest("[blockid]");
      if (blockElement) {
        const blockId = blockElement.getAttribute("blockid");
        if (blockId && !validMergeUuids.has(blockId)) {
          // Remove the control via injector to trigger unmount/onDestroy
          const container = control.closest(".feedback-rating-container") as HTMLElement;
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
    const container =
      parentDoc?.getElementById(TOOLBAR_CONTAINER_ID) ||
      document.getElementById(TOOLBAR_CONTAINER_ID);
    return container;
  }

  private showPageToolbar(mergeCount: number) {
    const container = this.getToolbarContainer();

    if (!container) {
      console.warn("[InjectMerges] Toolbar container not found, will retry...");
      // Retry after a short delay (registerUIItem may still be processing)
      setTimeout(() => this.showPageToolbar(mergeCount), 200);
      return;
    }

    // Show the container
    container.style.display = "block";

    // Check if we already have the app mounted
    if (!this.pageToolbarApp) {
      // Create shared state
      this.mergeState = new MergeState(mergeCount);

      this.pageToolbarApp = mount(PageMergeToolbar, {
        target: container,
        props: {
          mergeState: this.mergeState,
        },
      });
    } else {
      // Update state
      if (this.mergeState) {
        this.mergeState.updateCount(mergeCount);
      }
    }
  }

  private hidePageToolbar() {
    const container = this.getToolbarContainer();

    if (this.pageToolbarApp) {
      unmount(this.pageToolbarApp);
      this.pageToolbarApp = null;
      this.mergeState = null;
    }

    if (container) {
      container.style.display = "none";
      container.innerHTML = ""; // Clear content
    }
  }

  private hasMergeControlsMounted(element: HTMLElement): boolean {
    // We must use strict scoping to avoid false positives for parent blocks.
    const mainContainer = element.querySelector(".block-main-container");
    if (mainContainer) {
      const siblingContainer = mainContainer.nextElementSibling;
      return !!(
        siblingContainer?.classList.contains("feedback-rating-container") &&
        siblingContainer.querySelector(".lda-merge-controls")
      );
    }
    return !!element.querySelector(":scope > .feedback-rating-container .lda-merge-controls");
  }

  private hasMergeProperty(block: any): boolean {
    return !!(
      block?.properties &&
      (block.properties[LDA_MERGE_PROPERTY] || block.properties[LDA_MERGE_PROPERTY_CAMEL])
    );
  }

  private parseMergeData(block: any): MergeEntity | null {
    const propVal =
      block.properties[LDA_MERGE_PROPERTY] || block.properties[LDA_MERGE_PROPERTY_CAMEL];
    if (!propVal) return null;

    if (typeof propVal === "string") {
      try {
        return JSON.parse(propVal);
      } catch (e) {
        console.warn(`[InjectMerges] Failed to parse merge content for block ${block.uuid}`);
        return null;
      }
    }
    return propVal as MergeEntity;
  }

  private getCleanContent(content: string): string {
    if (!content) return "";
    const lines = content.split("\n");
    return lines
      .filter((l) => !l.includes(`${LDA_MERGE_PROPERTY}::`))
      .join("\n")
      .trim();
  }

  private async processMergeElement(element: HTMLElement) {
    try {
      const blockId = this.componentInjector.getBlockIdFromElement(element);
      if (!blockId || this.hasMergeControlsMounted(element)) return;

      const block = await this.logseqApi.Editor.getBlock(blockId);
      if (!block || !this.hasMergeProperty(block)) return;

      const mergeData = this.parseMergeData(block);
      if (mergeData) {
        mergeData.currentContent = this.getCleanContent(block.content);
        this.doInject(element, blockId, mergeData);
      }
    } catch (e) {
      console.error("[InjectMerges] Error processing element:", e);
    }
  }

  private doInject(element: HTMLElement, blockId: string, mergeData: MergeEntity) {
    // Inject the component
    const mainContainer = element.querySelector(".block-main-container");
    if (mainContainer) {
      this.componentInjector.injectComponentWithPosition(
        mainContainer as HTMLElement,
        MergeControls,
        InjectionPosition.NextSibling,
        {
          blockUuid: blockId,
          mergeData: mergeData,
        },
      );
    } else {
      // Fallback to old behavior
      this.componentInjector.injectComponentWithPosition(
        element,
        MergeControls,
        InjectionPosition.LastChild,
        {
          blockUuid: blockId,
          mergeData: mergeData,
        },
      );
    }
  }
}
