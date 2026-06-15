import type { ComponentInjector, LogseqApi, StyleInjector } from "../ports";
import { InjectionPosition } from "../../domain/logseq";
import { parseEvaluation, type BlockEvaluation } from "../../domain/evaluation/entity";
import { LDA_EVALUATION_PROPERTY } from "../../domain/logseq/properties";
import BlockEvaluationComponent from "../../ui/components/evaluation/BlockEvaluation.svelte";
import PageEvaluationToolbar from "../../ui/components/evaluation/PageEvaluationToolbar.svelte";
import cssContent from "../../ui/styles/evaluation-components.css?raw";
import { BaseBlockInjector, type InjectionConfig } from "../services/base-injector";
import { mount, unmount } from "svelte";
import { EvaluationState } from "./evaluation-state.svelte";

const TOOLBAR_CONTAINER_ID = "lda-eval-toolbar-slot";

/**
 * Specific use case for injecting BlockEvaluation components into elements with 'logseq-doc-agent.evaluation' property
 */
export class InjectEvaluationsUseCase extends BaseBlockInjector<BlockEvaluation> {
  private pageToolbarApp: any = null;
  private pageToolbarRegistered: boolean = false;
  private evaluationState: EvaluationState | null = null;

  constructor(
    componentInjector: ComponentInjector,
    private styleInjector: StyleInjector,
    logseqApi: LogseqApi,
  ) {
    super(componentInjector, logseqApi, "InjectEvaluations");
  }

  /**
   * Register the pagebar item once at plugin startup.
   */
  public registerPagebarItem() {
    if (this.pageToolbarRegistered) return;

    this.logseqApi.registerUIItem("toolbar", {
      key: "lda-eval-toolbar",
      template: `<div id="${TOOLBAR_CONTAINER_ID}" style="display: inline-flex; align-items: center;"></div>`,
    });

    this.pageToolbarRegistered = true;
  }

  public override async execute() {
    console.log("[InjectEvaluationsUseCase] Executing...");

    // Inject styles
    this.styleInjector.removeStyles("block-evaluation-styles");
    this.styleInjector.injectStyles(cssContent, "block-evaluation-styles");

    // Execute base injection logic
    await super.execute();
  }

  protected override onDispose() {
    this.styleInjector.removeStyles("block-evaluation-styles");
    this.hidePageToolbar();
  }

  protected override handleNoPage() {
    this.hidePageToolbar();
  }

  protected override handleQueryResults(count: number, blocks: any[]) {
    if (count === 0) {
      this.hidePageToolbar();
    } else {
      const uuids = blocks.map((b: any) => b.uuid);
      this.showPageToolbar(count, uuids);
    }
  }

  private getToolbarContainer(): HTMLElement | null {
    const doc = parent.document; // Plugin runs in iframe
    return doc.getElementById(TOOLBAR_CONTAINER_ID);
  }

  private showPageToolbar(count: number, uuids: string[]) {
    const container = this.getToolbarContainer();

    if (!container) {
      console.warn("[InjectEvaluations] Toolbar container not found, will retry...");
      setTimeout(() => this.showPageToolbar(count, uuids), 200);
      return;
    }

    container.style.display = "block";

    if (!this.pageToolbarApp) {
      this.evaluationState = new EvaluationState(count, uuids);

      this.pageToolbarApp = mount(PageEvaluationToolbar, {
        target: container,
        props: {
          evaluationState: this.evaluationState,
        },
      });
    } else {
      if (this.evaluationState) {
        this.evaluationState.update(count, uuids);
      }
    }
  }

  private hidePageToolbar() {
    const container = this.getToolbarContainer();

    if (this.pageToolbarApp) {
      unmount(this.pageToolbarApp);
      this.pageToolbarApp = null;
      this.evaluationState = null;
    }

    if (container) {
      container.style.display = "none";
      container.innerHTML = "";
    }
  }

  protected getInjectionConfig(): InjectionConfig {
    return {
      position: InjectionPosition.LastChild,
      containerClass: "block-evaluation-container",
    };
  }

  protected getComponent(): any {
    return BlockEvaluationComponent;
  }

  protected getPropertyName(): string {
    return LDA_EVALUATION_PROPERTY;
  }

  protected getComponentSelector(): string {
    return ".block-evaluation-container";
  }

  protected getQuery(currentPage: any): string {
    return `(and (property :${LDA_EVALUATION_PROPERTY}) (page [[${currentPage.originalName || currentPage.name}]]))`;
  }

  protected parseProperty(content: string, blockId: string): BlockEvaluation | null {
    try {
      return parseEvaluation(content);
    } catch (e) {
      console.warn(`[InjectEvaluations] Failed to parse content for ${blockId}: ${e}`);
      return null;
    }
  }

  protected override fetchBlockContent(): boolean {
    return true;
  }

  protected getComponentProps(blockId: string, data: BlockEvaluation, blockContent?: string): any {
    return {
      evaluationData: data,
      blockId: blockId,
      blockText: blockContent,
    };
  }
}
