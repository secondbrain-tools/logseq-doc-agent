import { mount, unmount } from "svelte";
import type { ToolbarInjector } from "../../application/ports/toolbar-injector";
import Toolbar from "../../ui/components/Toolbar.svelte";

export class FrontendToolbarInjector implements ToolbarInjector {
  private toolbarApp: any = null;
  private toolbarContainer: HTMLElement | null = null;
  private items: { key: string; icon: string; title: string; onClick: () => void }[] = [];

  injectToolbarItem(key: string, icon: string, title: string, onClick: () => void): void {
    console.log(`[LDA Debug] injecting toolbar item: ${key}`);

    // 1. Logseq Environment
    if (typeof (window as any).logseq?.App?.registerUIItem === "function") {
      console.log("[LDA Debug] Registering UI item via Logseq API");
      (window as any).logseq.App.registerUIItem("toolbar", {
        key,
        template: `
                    <a class="button" data-on-click="${key}" title="${title}">
                        <i class="ti ${icon}"></i>
                    </a>
                `,
      });

      // Register handler
      (window as any).logseq.provideModel({
        [key]: () => {
          console.log(`[LDA Debug] Toolbar item ${key} clicked (Logseq API)`);
          onClick();
        },
      });
      return;
    }

    // 2. Simulator Environment
    // If we are in sim, we might need to mount our own Toolbar component if it doesnt exist
    // or add to it.
    // For simplicity in Svelte 5 with this setup, let's maintain a list of items and pass them to a reactive Toolbar component.

    this.items.push({ key, icon, title, onClick });
    this.updateSimulatorToolbar();
  }

  private updateSimulatorToolbar() {
    // Find or create a container for the simulator toolbar
    // In logseq-sim.html, we might want to inject it into .cp__header or similar.
    // Let's look for #head or .cp__header

    const head = document.getElementById("head") || document.querySelector(".cp__header");
    if (!head) {
      console.warn("[LDA Debug] No header found for simulator toolbar");
      return;
    }

    // Check if we already have a container
    if (!this.toolbarContainer) {
      this.toolbarContainer = document.createElement("div");
      this.toolbarContainer.id = "sim-toolbar-container";
      this.toolbarContainer.className = "flex items-center gap-2";
      // Insert before the right-side controls (if any) or append
      // In sim, the header structure is simple. Let's just append to head for now, maybe floats right.
      this.toolbarContainer.style.position = "absolute";
      this.toolbarContainer.style.right = "20px";
      this.toolbarContainer.style.top = "10px";

      head.appendChild(this.toolbarContainer);
    }

    // Mount or Update the Svelte component
    // Since we are adding items potentially one by one, we need the component to be reactive to the list
    // Or we re-mount. With Svelte 5 mount/unmount, re-mounting is acceptable for low freq updates.
    // Ideally we pass a state object.

    if (this.toolbarApp) {
      unmount(this.toolbarApp);
    }

    this.toolbarApp = mount(Toolbar, {
      target: this.toolbarContainer,
      props: {
        items: this.items,
      },
    });
  }
}
