import type { ComponentInjector, LogseqApi, StyleInjector } from '../ports';
import { InjectionPosition } from '../../domain/logseq';
import { FeedbackParser } from '../../domain/rating';
import type { FeedbackRating } from '../../domain/rating';
import FeedbackRatingComponent from '../../ui/components/rating/FeedbackRating.svelte';
import cssContent from '../../ui/styles/feedback-components.css?raw';

/**
 * Specific use case for injecting FeedbackRating components into elements with 'feedback' property
 * This use case is an orchestrator that specifically handles feedback rating injection
 */
export class InjectRatingsUseCase {
  constructor(private componentInjector: ComponentInjector, private styleInjector: StyleInjector, private logseqApi: LogseqApi) { }

  public dispose() {
    console.log('[InjectRatingsUseCase] Disposing...');
    // Cleanup styles
    this.styleInjector.removeStyles('feedback-rating-styles');

    // Cleanup injected components
    // We cast to access the concrete method not in the interface (unless we update interface)
    // Ideally we should update the interface, but for now we cast or assume it's available if we know the concrete type in main.
    // Since we are inside the class, we just call it.
    // Wait, componentInjector is typed as ComponentInjector interface.
    // I need to check if ComponentInjector interface has dispose.
    // It likely doesn't. 
    if ('dispose' in this.componentInjector) {
      (this.componentInjector as any).dispose();
    }
  }

  /**
   * Injects FeedbackRating components into all elements with 'feedback' property in their data-refs-self attribute
   */
  async execute() {
    try {

      const position = InjectionPosition.LastChild;
      const containerClass = 'feedback-rating-container';

      this.styleInjector.removeStyles('feedback-rating-styles');
      this.styleInjector.injectStyles(cssContent, 'feedback-rating-styles');

      // Find all elements with 'feedback' property in data-refs-self attribute
      const feedbackElements = this.componentInjector.findBlockElementsWithProperty('feedback');

      if (feedbackElements.length === 0) {
        console.log('No elements with feedback property found');
        return {
          success: true,
          injectedRatings: []
        };
      }

      console.log(`Found ${feedbackElements.length} elements with feedback property`);

      const injectedRatings: Array<{
        targetId: string;
        container: HTMLElement;
        blockId?: string;
        feedbackData?: FeedbackRating;
      }> = [];

      // Process each element sequentially to avoid race conditions
      for (const element of feedbackElements) {
        try {
          // Create a unique ID for the target element
          const targetId = this.generateTargetId(element);

          // Extract block ID from 'blockid' attribute
          const blockId = this.componentInjector.getBlockIdFromElement(element);

          console.log(`Processing element: ${targetId}, blockId: ${blockId || 'N/A'}`);

          let feedbackData: FeedbackRating | undefined;
          let props: any = null;// Default rating

          if (blockId) {
            const feedbackContent = await this.logseqApi.Editor.getBlockPropertyContent(blockId, 'feedback');
            console.log(`Feedback property content for blockId ${blockId}:`, feedbackContent);

            if (feedbackContent) {
              try {
                // Parse the feedback content using our parser
                feedbackData = FeedbackParser.parseFromJsonString(targetId, feedbackContent, targetId);
                console.log(`Parsed feedback data for blockId ${blockId}:`, feedbackData);
                props = {
                  rating: feedbackData.overallRating,
                  feedbackData: feedbackData,
                  categoryRatings: feedbackData.categoryRatings
                };

                console.log(`Successfully parsed feedback data for blockId ${blockId}, overall rating: ${feedbackData.overallRating}`);
              } catch (parseError) {
                console.warn(`Failed to parse feedback content for blockId ${blockId}:`, parseError);
                // Fall back to default rating if parsing fails

              }
            } else {
              console.log(`No feedback content found for blockId ${blockId}`);

            }
          }

          if (props) {
            // Inject the FeedbackRating component at the specified position
            const container = this.componentInjector.injectComponentWithPosition(
              element,
              FeedbackRatingComponent,
              position,
              props
            );


            // Apply custom container class if provided
            if (containerClass) {
              container.className = containerClass;
            }

            injectedRatings.push({
              targetId,
              container,
              blockId: blockId || undefined,
              feedbackData
            });
            console.log(`Successfully injected FeedbackRating component for element: ${targetId}, rating: ${props.rating}`);
          }
        } catch (error) {
          console.error('Failed to inject FeedbackRating component for element:', error);
        }
      }

      return {
        success: true,
        injectedRatings
      };

    } catch (error) {
      console.error('Error in injectRatings use case:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        injectedRatings: []
      };
    }
  }

  /**
   * Generates a unique identifier for a target element
   */
  private generateTargetId(element: HTMLElement): string {
    // Try to use block ID if available
    const blockId = this.componentInjector.getBlockIdFromElement(element);
    if (blockId) {
      return `block-${blockId}`;
    }

    // Fall back to element ID if available
    if (element.id) {
      return `element-${element.id}`;
    }

    // Generate a unique ID based on element position
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element);
      return `element-${parent.tagName.toLowerCase()}-${index}`;
    }

    // Last resort: use a random ID
    return `element-${Math.random().toString(36).substr(2, 9)}`;
  }
}