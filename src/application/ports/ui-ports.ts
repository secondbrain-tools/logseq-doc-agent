/**
 * Ports for UI-related operations
 */

export interface StyleInjector {
  injectStyles(cssContent: string, styleId: string): void;
  removeStyles(styleId: string): void;
  isStylesInjected(styleId: string): boolean;
}

export interface ComponentInjector {
  // Existing methods
  injectComponent(target: HTMLElement, component: any, props?: any): void;
  removeComponent(container: HTMLElement): void;
  findInjectionTargets(): HTMLElement[];
  
  // New methods for enhanced injection functionality
  findBlockElementsWithProperty(property: string): HTMLElement[];
  getBlockIdFromElement(element: HTMLElement): string | null;
  injectComponentWithPosition(
    target: HTMLElement,
    component: any,
    position?: import('../../domain/value-objects').InjectionPosition,
    props?: any
  ): HTMLElement;
}