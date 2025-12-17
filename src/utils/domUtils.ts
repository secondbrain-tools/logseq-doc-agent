import { mount } from 'svelte';
import FeedbackRating from '../components/FeedbackRating.svelte';
import cssContent from '../styles/feedback-components.css?raw';

/**
 * Inject CSS styles into the main document
 */
function injectStyles(): void {
  const mainDocument = window.parent?.document || window.top?.document;
  
  if (!mainDocument) {
    console.error('Cannot access main Logseq document for style injection');
    return;
  }

  // Check if styles are already injected
  const existingStyleId = 'feedback-rating-styles';
  if (mainDocument.getElementById(existingStyleId)) {
    return; // Styles already injected
  }

  // Create style element with the imported CSS content
  const styleElement = mainDocument.createElement('style');
  styleElement.id = existingStyleId;
  styleElement.textContent = cssContent;

  // Inject styles into the main document's head
  mainDocument.head.appendChild(styleElement);
  console.log('Feedback rating styles injected into main document');
}

/**
 * Find all div elements that have "feedback" in their data-refs array
 */
export function findFeedbackElements(): HTMLElement[] {

 const mainDocument = window.parent?.document || window.top?.document;
  
  if (!mainDocument) {
    console.error('Cannot access main Logseq document');
    return [];
  }

  
  const allElements = mainDocument.querySelectorAll('div[data-refs-self]');
  console.log(`Found ${allElements.length} elements with data-refs attribute.`);
  const feedbackElements: HTMLElement[] = [];
  
  allElements.forEach((element) => {
    console.log(`Checking element:`, element);
    const dataRefs = element.getAttribute('data-refs-self');
    console.log(`data-refs attribute:`, dataRefs);
    if (dataRefs) {
      try {
        // Parse the JSON array from data-refs attribute
        const refsArray = JSON.parse(dataRefs);
        console.log(`Found data-refs for element: ${element}`, refsArray);
        if (Array.isArray(refsArray) && refsArray.includes('feedback')) {
          feedbackElements.push(element as HTMLElement);
        }
      } catch (error) {
        console.warn('Failed to parse data-refs:', dataRefs, error);
      }
    }
  });
  
  return feedbackElements;
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
    
    // Make sure the parent element can contain positioned children
    if (element.parentNode) {
      (element.parentNode as HTMLElement).style.position = 'relative';
    }
    
    // Create a container for our component
    const container = document.createElement('div');
    container.className = 'feedback-rating-container';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = `${element.offsetWidth}px`;
    container.style.zIndex = '1';
    container.style.width = '10em';
    
    // Generate a random rating for demonstration (1-4)
    const randomRating = Math.floor(Math.random() * 4) + 1;
    
    // Insert the container as a sibling after the target element
    element.parentNode?.insertBefore(container, element.nextSibling);
    
    // Mount the FeedbackRating component
    mount(FeedbackRating, {
      target: container,
      props: {
        rating: randomRating
      }
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
  
  // Also remove the injected styles from the main document
  const mainDocument = window.parent?.document || window.top?.document;
  if (mainDocument) {
    const styleElement = mainDocument.getElementById('feedback-rating-styles');
    if (styleElement) {
      styleElement.remove();
      console.log('Feedback rating styles removed from main document');
    }
  }
}