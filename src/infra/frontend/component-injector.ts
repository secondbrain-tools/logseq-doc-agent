import { mount } from 'svelte';
import type { ComponentInjector } from '../../application/ports';

/**
 * Concrete implementation of ComponentInjector for frontend applications
 */
export class FrontendComponentInjector implements ComponentInjector {
  injectComponent(target: HTMLElement, component: any, props?: any): void {
    if (!target) {
      console.error('Target element is required for component injection');
      return;
    }

    // Make sure the parent element can contain positioned children
    if (target.parentNode) {
      (target.parentNode as HTMLElement).style.position = 'relative';
    }
    
    // Create a container for our component
    const container = document.createElement('div');
    container.className = 'feedback-rating-container';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = `${target.offsetWidth}px`;
    container.style.zIndex = '1';
    container.style.width = '10em';
    
    // Insert the container as a sibling after the target element
    target.parentNode?.insertBefore(container, target.nextSibling);
    
    // Mount the component
    mount(component, {
      target: container,
      props: props || {}
    });
    
    console.log('Component injected successfully');
  }

  removeComponent(container: HTMLElement): void {
    if (container) {
      container.remove();
      console.log('Component removed successfully');
    }
  }

  findInjectionTargets(): HTMLElement[] {
    const allElements = document.querySelectorAll('div[data-refs-self]');
    console.log(`Found ${allElements.length} elements with data-refs attribute.`);
    const feedbackElements: HTMLElement[] = [];
    
    allElements.forEach((element) => {
      const dataRefs = element.getAttribute('data-refs-self');
      if (dataRefs) {
        try {
          // Parse the JSON array from data-refs attribute
          const refsArray = JSON.parse(dataRefs);
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
}