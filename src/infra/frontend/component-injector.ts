import { mount, unmount } from "svelte";
import type { ComponentInjector } from "../../application/ports";
import { InjectionPosition } from "../../domain/logseq";

/**
 * Concrete implementation of ComponentInjector for frontend applications
 * This implementation handles both standard DOM and Logseq's iframe context
 */
export class FrontendComponentInjector implements ComponentInjector {
  private injectedComponents: Map<HTMLElement, any> = new Map();

  private getMainDocument(): Document | null {
    // Try to access the parent document (for Logseq iframe context)
    // Fall back to current document if not available
    return window.parent?.document || window.top?.document || document;
  }

  public dispose(): void {
    const count = this.injectedComponents.size;
    if (count > 0) {
      console.debug(`[FrontendComponentInjector] Disposing ${count} components...`);
    }

    this.injectedComponents.forEach((app, container) => {
      try {
        // Unmount the Svelte app instance to trigger onDestroy/cleanup lifecycles
        unmount(app);

        // Remove the container from DOM
        container.remove();
      } catch (e) {
        console.warn("Error removing component container:", e);
      }
    });
    this.injectedComponents.clear();
  }

  injectComponent(target: HTMLElement, component: any, props?: any): void {
    this.injectComponentWithPosition(target, component, InjectionPosition.NextSibling, props);
  }

  injectComponentWithPosition(
    target: HTMLElement,
    component: any,
    position: InjectionPosition = InjectionPosition.NextSibling,
    props?: any,
  ): HTMLElement {
    if (!target) {
      throw new Error("Target element is required for component injection");
    }

    // Make sure the positioning context is correct
    if (position === InjectionPosition.FirstChild || position === InjectionPosition.LastChild) {
      target.style.position = "relative";
    } else if (target.parentNode) {
      (target.parentNode as HTMLElement).style.position = "relative";
    }

    // Create a container for our component
    const container = document.createElement("div");
    container.className = "feedback-rating-container";
    container.style.position = "absolute";
    container.style.top = "0";
    container.style.left = "100%";
    container.style.marginLeft = "10px";
    container.style.zIndex = "1"; // visible above block bg
    container.style.width = "max-content"; // Allow to fit content

    // Insert the container based on the specified position
    this.insertContainerAtPosition(container, target, position);

    // Mount the component
    const app = mount(component, {
      target: container,
      props: props || {},
    });

    this.injectedComponents.set(container, app);
    return container;
  }

  private insertContainerAtPosition(
    container: HTMLElement,
    target: HTMLElement,
    position: InjectionPosition,
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
    if (container && this.injectedComponents.has(container)) {
      const app = this.injectedComponents.get(container);
      try {
        unmount(app);
      } catch (e) {
        // Ignore unmount errors during removal
      }

      this.injectedComponents.delete(container);
      container.remove();
    }
  }

  findInjectionTargets(): HTMLElement[] {
    return this.findBlockElementsWithProperty("feedback");
  }

  findBlockElementsWithProperty(property: string): HTMLElement[] {
    const mainDocument = this.getMainDocument();

    if (!mainDocument) {
      console.error("FrontendComponentInjector: Cannot access document");
      return [];
    }

    // Note: This relies on Logseq's internal data-refs-self attribute
    const allElements = mainDocument.querySelectorAll("div[data-refs-self]");
    const matchingElements: HTMLElement[] = [];

    allElements.forEach((element) => {
      const dataRefs = element.getAttribute("data-refs-self");
      if (dataRefs) {
        try {
          // Parse the JSON array from data-refs attribute
          const refsArray = JSON.parse(dataRefs);
          if (Array.isArray(refsArray) && refsArray.includes(property)) {
            matchingElements.push(element as HTMLElement);
          }
        } catch (error) {
          // Silent failure for parsing issues is acceptable here as we just skip the element
        }
      }
    });

    return matchingElements;
  }

  findBlockElements(uuids: string[]): HTMLElement[] {
    const mainDocument = this.getMainDocument();
    if (!mainDocument) {
      console.error("FrontendComponentInjector: Cannot access document");
      return [];
    }

    const elements: HTMLElement[] = [];

    uuids.forEach((uuid) => {
      // Logseq's DOM uses blockid attribute on divs
      const el = mainDocument.querySelector(`div[blockid="${uuid}"]`);
      if (el) {
        elements.push(el as HTMLElement);
      }
    });

    return elements;
  }

  getBlockIdFromElement(element: HTMLElement): string | null {
    if (!element) return null;
    return element.getAttribute("blockid");
  }
}
