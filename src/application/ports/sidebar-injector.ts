export interface SidebarInjector {
    /**
     * Injects a component into the sidebar
     * @param component The Svelte component constructor/class
     * @param props The props to pass to the component
     * @param title Title of the sidebar window
     * @param icon Optional SVG icon string
     */
    injectIntoSidebar(component: any, props: any, title: string, icon?: string, options?: { onMaximize?: () => void }): void;
    /**
     * Toggles the maximization state of the sidebar window
     * @param title Title of the sidebar window
     */
    toggleWindowMaximize(title: string): void;
}
