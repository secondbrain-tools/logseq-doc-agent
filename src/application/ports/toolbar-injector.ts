export interface ToolbarInjector {
    injectToolbarItem(key: string, icon: string, title: string, onClick: () => void): void;
}
