import type { ComponentInjector, LogseqApi, StyleInjector } from '../ports';
import { InjectionPosition } from '../../domain/logseq';
import { FeedbackParser } from '../../domain/rating';
import type { FeedbackRating } from '../../domain/rating';
import FeedbackRatingComponent from '../../ui/components/rating/FeedbackRating.svelte';
import cssContent from '../../ui/styles/feedback-components.css?raw';
import { BaseBlockInjector, type InjectionConfig } from '../services/base-injector';

/**
 * Specific use case for injecting FeedbackRating components into elements with 'feedback' property
 * This use case is an orchestrator that specifically handles feedback rating injection
 */
export class InjectRatingsUseCase extends BaseBlockInjector<FeedbackRating> {

  constructor(
    componentInjector: ComponentInjector,
    private styleInjector: StyleInjector,
    logseqApi: LogseqApi
  ) {
    super(componentInjector, logseqApi, 'InjectRatings');
  }

  public override async execute() {
    console.log('[InjectRatingsUseCase] Executing...');

    // Inject styles
    this.styleInjector.removeStyles('feedback-rating-styles');
    this.styleInjector.injectStyles(cssContent, 'feedback-rating-styles');

    // Execute base injection logic
    await super.execute();
  }

  protected override onDispose() {
    this.styleInjector.removeStyles('feedback-rating-styles');
  }

  protected getInjectionConfig(): InjectionConfig {
    return {
      position: InjectionPosition.LastChild,

      containerClass: 'feedback-rating-container'
    };
  }

  protected getComponent(): any {
    return FeedbackRatingComponent;
  }

  protected getPropertyName(): string {
    return 'feedback';
  }

  protected getComponentSelector(): string {
    // Based on containerClass or specific selector
    return '.feedback-rating-container';
  }

  protected getQuery(currentPage: any): string {
    return `(and (property :feedback) (page [[${currentPage.originalName || currentPage.name}]]))`;
  }

  protected parseProperty(content: string, blockId: string): FeedbackRating | null {
    try {
      // We need a targetId for the parser.
      // In original code: `generateTargetId(element)`
      // Here we don't have the element reference easily inside parseProperty?
      // Actually `parseProperty` is called before injection.
      // But `FeedbackParser.parseFromJsonString` takes `targetId`?
      // Let's see what `targetId` was used for. 
      // `targetId` was passed to `FeedbackRatingComponent` as a prop.
      // It seems `FeedbackParser` uses it to set an ID in the object?
      // Let's assume we can generate a targetId here or use blockId.
      const targetId = `block-${blockId}`;
      return FeedbackParser.parseFromJsonString(targetId, content, targetId);
    } catch (e) {
      console.warn(`[InjectRatings] Failed to parse content for ${blockId}: ${e}`);
      return null;
    }
  }

  protected getComponentProps(blockId: string, data: FeedbackRating): any {
    return {
      rating: data.overallRating,
      feedbackData: data,
      categoryRatings: data.categoryRatings,
      // Original code passed `targetId` implicitly via the injectedRatings array return,
      // but mapped props explicitly in `props` object:
      /*
      props = {
            rating: feedbackData.overallRating,
            feedbackData: feedbackData,
            categoryRatings: feedbackData.categoryRatings
      };
      */
      // So targetId wasn't passed as prop?
      // Ah, checking original code...
      // `targetId` was not in props! It was just for internal tracking in `injectedRatings` array.
      // So we are good.
    };
  }
}