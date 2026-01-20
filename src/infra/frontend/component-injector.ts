import { mount } from 'svelte';
import type { ComponentInjector } from '../../application/ports';
import { InjectionPosition } from '../../domain/logseq';

/**
 * Concrete implementation of ComponentInjector for frontend applications
 * This implementation handles both standard DOM and Logseq's iframe context
 */
export class FrontendComponentInjector implements ComponentInjector {
  private getMainDocument(): Document | null {
    // Try to access the parent document (for Logseq iframe context)
    // Fall back to current document if not available
    return window.parent?.document || window.top?.document || document;
  }

  injectComponent(target: HTMLElement, component: any, props?: any): void {
    this.injectComponentWithPosition(target, component, InjectionPosition.NextSibling, props);
  }

  injectComponentWithPosition(
    target: HTMLElement,
    component: any,
    position: InjectionPosition = InjectionPosition.NextSibling,
    props?: any
  ): HTMLElement {
    if (!target) {
      console.error('Target element is required for component injection');
      throw new Error('Target element is required for component injection');
    }

    // Make sure the positioning context is correct
    if (position === InjectionPosition.FirstChild || position === InjectionPosition.LastChild) {
      target.style.position = 'relative';
    } else if (target.parentNode) {
      (target.parentNode as HTMLElement).style.position = 'relative';
    }

    // Create a container for our component
    const container = document.createElement('div');
    container.className = 'feedback-rating-container';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '100%';
    container.style.marginLeft = '10px';
    container.style.zIndex = '1'; // visible above block bg
    container.style.width = 'max-content'; // Allow to fit content

    // Insert the container based on the specified position
    this.insertContainerAtPosition(container, target, position);

    // Mount the component
    mount(component, {
      target: container,
      props: props || {}
    });

    console.log(`Component injected at position: ${position}`);
    return container;
  }

  private insertContainerAtPosition(
    container: HTMLElement,
    target: HTMLElement,
    position: InjectionPosition
  ): void {
    switch (position) {
      case InjectionPosition.NextSibling:
        target.parentNode?.insertBefore(container, target.nextSibling);
        break;
      case InjectionPosition.PreviousSibling:
        target.parentNode?.insertBefore(container, target);
        break;
      case InjectionPosition.FirstChild:
        target.insertBefore(container, target.firstChild);
        break;
      case InjectionPosition.LastChild:
        target.appendChild(container);
        break;
      case InjectionPosition.Replace:
        target.parentNode?.replaceChild(container, target);
        break;
      default:
        // Default to NextSibling
        target.parentNode?.insertBefore(container, target.nextSibling);
    }
  }

  removeComponent(container: HTMLElement): void {
    if (container) {
      container.remove();
      console.log('Component removed successfully');
    }
  }

  findInjectionTargets(): HTMLElement[] {
    return this.findBlockElementsWithProperty('feedback');
  }

  findBlockElementsWithProperty(property: string): HTMLElement[] {
    const mainDocument = this.getMainDocument();

    if (!mainDocument) {
      console.error('Cannot access document');
      return [];
    }

    const allElements = mainDocument.querySelectorAll('div[data-refs-self]');
    console.log(`Found ${allElements.length} elements with data-refs-self attribute.`);
    const matchingElements: HTMLElement[] = [];

    allElements.forEach((element) => {
      const dataRefs = element.getAttribute('data-refs-self');
      if (dataRefs) {
        try {
          // Parse the JSON array from data-refs attribute
          const refsArray = JSON.parse(dataRefs);
          if (Array.isArray(refsArray) && refsArray.includes(property)) {
            matchingElements.push(element as HTMLElement);
          }
        } catch (error) {
          console.warn('Failed to parse data-refs-self:', dataRefs, error);
        }
      }
    });

    console.log(`Found ${matchingElements.length} elements with property: ${property}`);
    return matchingElements;
  }

  getBlockIdFromElement(element: HTMLElement): string | null {
    if (!element) {
      console.error('Element is required for block ID extraction');
      return null;
    }

    // Look for the 'blockid' attribute as specified
    const blockId = element.getAttribute('blockid');

    if (blockId) {
      console.log(`Found block ID: ${blockId}`);
      return blockId;
    }

    console.warn('No blockid attribute found on element');
    return null;
  }
}