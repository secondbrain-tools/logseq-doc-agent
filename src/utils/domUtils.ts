import { mount } from 'svelte';
import FeedbackRating from '../components/FeedbackRating.svelte';

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

  // Create style element with all required CSS
  const styleElement = mainDocument.createElement('style');
  styleElement.id = existingStyleId;
  styleElement.textContent = `
    .feedback-rating {
      display: inline-block;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      transition: all 0.2s ease;
      user-select: none;
      margin-left: 8px;
      vertical-align: middle;
      background: transparent;
      border: none;
    }
    
    .feedback-rating:hover {
      transform: scale(1.1);
      filter: brightness(1.2);
    }
    
    .popover-container {
      position: fixed;
      z-index: 9999;
      transform: translateX(-50%) translateY(-100%);
      animation: fadeIn 0.2s ease-out;
      pointer-events: auto;
    }
    
    .popover-arrow {
      position: absolute;
      bottom: -8px;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 8px solid transparent;
      border-right: 8px solid transparent;
      border-top: 8px solid white;
      filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.1));
    }
    
    .rating-popover {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.1);
      min-width: 250px;
      max-width: 350px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      backdrop-filter: blur(10px);
      transform: translateZ(0);
    }
    
    .popover-header {
      background: #f9fafb;
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .popover-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #374151;
    }
    
    .popover-content {
      padding: 12px 16px;
    }
    
    .ratings-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    
    .ratings-table th {
      text-align: left;
      padding: 8px 4px;
      font-weight: 600;
      color: #6b7280;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .ratings-table td {
      padding: 8px 4px;
      border-bottom: 1px solid #f3f4f6;
    }
    
    .ratings-table tr:last-child td {
      border-bottom: none;
    }
    
    .category-name {
      color: #374151;
      font-weight: 500;
    }
    
    .rating-stars {
      font-weight: bold;
      font-size: 14px;
      text-align: center;
    }
    
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(-5px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }
  `;

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