import type { StyleInjector } from '../../application/ports';

/**
 * Concrete implementation of StyleInjector for frontend applications
 */
export class FrontendStyleInjector implements StyleInjector {
  injectStyles(cssContent: string, styleId: string): void {
    // Check if styles are already injected
    if (this.isStylesInjected(styleId)) {
      return; // Styles already injected
    }

    // Create style element with the CSS content
    const styleElement = document.createElement('style');
    styleElement.id = styleId;
    styleElement.textContent = cssContent;

    // Inject styles into the document's head
    document.head.appendChild(styleElement);
    console.log(`Styles with ID '${styleId}' injected into document`);
  }

  removeStyles(styleId: string): void {
    const styleElement = document.getElementById(styleId);
    if (styleElement) {
      styleElement.remove();
      console.log(`Styles with ID '${styleId}' removed from document`);
    }
  }

  isStylesInjected(styleId: string): boolean {
    return !!document.getElementById(styleId);
  }
}