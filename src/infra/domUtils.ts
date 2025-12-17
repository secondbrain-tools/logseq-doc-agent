import { mount } from 'svelte';
import FeedbackRating from '../ui/components/FeedbackRating.svelte';
import cssContent from '../ui/styles/feedback-components.css?raw';
import { LogseqStyleInjector, LogseqComponentInjector } from './logseq';

// Create instances of our infrastructure services
const styleInjector = new LogseqStyleInjector();
const componentInjector = new LogseqComponentInjector();

/**
 * Inject CSS styles into the main document
 */
function injectStyles(): void {
  styleInjector.injectStyles(cssContent, 'feedback-rating-styles');
}

/**
 * Find all div elements that have "feedback" in their data-refs array
 */
export function findFeedbackElements(): HTMLElement[] {
  return componentInjector.findInjectionTargets();
}

export function injectFeedbackComponents(): void {
  // First, inject the required styles into the main document
  injectStyles();
  
  const feedbackElements = findFeedbackElements();
  
  console.log(`Found ${feedbackElements.length} feedback elements to inject components into.`);
  
  feedbackElements.forEach((element, index) => {
    // Check if we've already injected a component for this element
    const existingComponent = element.parentNode?.querySelector('.feedback-rating-container');
    if (existingComponent) {
      return; // Skip if already injected
    }
    
    // Generate a random rating for demonstration (1-4)
    const randomRating = Math.floor(Math.random() * 4) + 1;
    
    // Inject the component
    componentInjector.injectComponent(element, FeedbackRating, {
      rating: randomRating
    });
    
    console.log(`Injected feedback component with rating ${randomRating} to the right of element ${index + 1}`);
  });
}

/**
 * Remove all injected feedback components
 */
export function removeFeedbackComponents(): void {
  // Remove injected components
  const containers = document.querySelectorAll('.feedback-rating-container');
  containers.forEach(container => {
    container.remove();
  });
  
  // Remove the injected styles from the main document
  styleInjector.removeStyles('feedback-rating-styles');
}