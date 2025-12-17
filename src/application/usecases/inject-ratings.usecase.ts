import type { ComponentInjector, StyleInjector } from '../ports';
import { InjectionPosition } from '../../domain/value-objects';
import FeedbackRating from '../../ui/components/FeedbackRating.svelte';
import cssContent from '../../ui/styles/feedback-components.css?raw';

/**
 * Specific use case for injecting FeedbackRating components into elements with 'feedback' property
 * This use case is an orchestrator that specifically handles feedback rating injection
 */
export class InjectRatingsUseCase {
  constructor(private componentInjector: ComponentInjector, private styleInjector: StyleInjector) {}

  /**
   * Injects FeedbackRating components into all elements with 'feedback' property in their data-refs-self attribute
   */
  async execute(){ 
    try {
      
      const position = InjectionPosition.NextSibling;
      const props = { rating: 3 };
      const containerClass = 'feedback-rating-container';
      
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
      }> = [];

      // Inject FeedbackRating component into each found element
      feedbackElements.forEach((element) => {
        try {
          // Create a unique ID for the target element
          const targetId = this.generateTargetId(element);
          
          // Extract block ID from 'blockid' attribute
          const blockId = this.componentInjector.getBlockIdFromElement(element);
          
          // Inject the FeedbackRating component at the specified position
          const container = this.componentInjector.injectComponentWithPosition(
            element,
            FeedbackRating,
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
            blockId: blockId || undefined
          });
          
          console.log(`Successfully injected FeedbackRating component for element: ${targetId}`);
        } catch (error) {
          console.error('Failed to inject FeedbackRating component for element:', error);
        }
      });

    } catch (error) {
      console.error('Error in injectRatings use case:', error);    
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