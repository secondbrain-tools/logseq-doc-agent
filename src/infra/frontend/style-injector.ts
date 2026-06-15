import type { StyleInjector } from "../../application/ports";

/**
 * Concrete implementation of StyleInjector for frontend applications
 */
export class FrontendStyleInjector implements StyleInjector {
  private getMainDocument(): Document | null {
    return window.parent?.document || window.top?.document;
  }

  injectStyles(cssContent: string, styleId: string): void {
    const mainDocument = this.getMainDocument();

    if (!mainDocument) {
      console.error("Cannot access main Logseq document for style injection");
      return;
    }

    // Check if styles are already injected
    if (this.isStylesInjected(styleId)) {
      return; // Styles already injected
    }

    // Create style element with the CSS content
    const styleElement = mainDocument.createElement("style");
    styleElement.id = styleId;
    styleElement.textContent = cssContent;

    // Inject styles into the main document's head
    mainDocument.head.appendChild(styleElement);
    console.log(`Styles with ID '${styleId}' injected into main document`);
  }

  removeStyles(styleId: string): void {
    const mainDocument = this.getMainDocument();
    if (!mainDocument) return;

    const styleElement = mainDocument.getElementById(styleId);
    if (styleElement) {
      styleElement.remove();
      console.log(`Styles with ID '${styleId}' removed from main document`);
    }
  }

  isStylesInjected(styleId: string): boolean {
    const mainDocument = this.getMainDocument();
    if (!mainDocument) return false;

    return !!mainDocument.getElementById(styleId);
  }
}
