/**
 * Ports for UI-related operations
 */

export interface StyleInjector {
  injectStyles(cssContent: string, styleId: string): void;
  removeStyles(styleId: string): void;
  isStylesInjected(styleId: string): boolean;
}

export interface ComponentInjector {
  injectComponent(target: HTMLElement, component: any, props?: any): void;
  removeComponent(container: HTMLElement): void;
  findInjectionTargets(): HTMLElement[];
}