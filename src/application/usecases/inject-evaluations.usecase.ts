import type { ComponentInjector, LogseqApi, StyleInjector } from '../ports';
import { InjectionPosition } from '../../domain/logseq';
import { parseEvaluation, type BlockEvaluation } from '../../domain/evaluation/entity';
import { LDA_EVALUATION_PROPERTY } from '../../domain/logseq/properties';
import BlockEvaluationComponent from '../../ui/components/evaluation/BlockEvaluation.svelte';
import cssContent from '../../ui/styles/evaluation-components.css?raw';
import { BaseBlockInjector, type InjectionConfig } from '../services/base-injector';

/**
 * Specific use case for injecting BlockEvaluation components into elements with 'logseq-doc-agent.evaluation' property
 */
export class InjectEvaluationsUseCase extends BaseBlockInjector<BlockEvaluation> {

  constructor(
    componentInjector: ComponentInjector,
    private styleInjector: StyleInjector,
    logseqApi: LogseqApi
  ) {
    super(componentInjector, logseqApi, 'InjectEvaluations');
  }

  public override async execute() {
    console.log('[InjectEvaluationsUseCase] Executing...');

    // Inject styles
    this.styleInjector.removeStyles('block-evaluation-styles');
    this.styleInjector.injectStyles(cssContent, 'block-evaluation-styles');

    // Execute base injection logic
    await super.execute();
  }

  protected override onDispose() {
    this.styleInjector.removeStyles('block-evaluation-styles');
  }

  protected getInjectionConfig(): InjectionConfig {
    return {
      position: InjectionPosition.LastChild,
      containerClass: 'block-evaluation-container'
    };
  }

  protected getComponent(): any {
    return BlockEvaluationComponent;
  }

  protected getPropertyName(): string {
    return LDA_EVALUATION_PROPERTY;
  }

  protected getComponentSelector(): string {
    return '.block-evaluation-container';
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

  protected getComponentProps(blockId: string, data: BlockEvaluation): any {
    return {
      evaluationData: data
    };
  }
}