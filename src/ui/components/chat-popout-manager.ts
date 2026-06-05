import { mount, unmount } from "svelte";

export class PopoutManager {
  private popoutWindow: Window | null = null;
  private popoutApp: any = null;

  constructor(private onStateChange: (isPoppedOut: boolean) => void) {}

  public togglePopout(Component: any, componentProps: any, isPoppedOut: boolean) {
    if (isPoppedOut) {
      // Focus existing window
      this.popoutWindow?.focus();
      return;
    }

    // Open new window
    const width = 400;
    const height = 600;
    const left = window.screenX + window.outerWidth / 2 - width / 2;
    const top = window.screenY + window.outerHeight / 2 - height / 2;

    this.popoutWindow = window.open(
      "",
      "lda-popout-" + Date.now(),
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );

    if (!this.popoutWindow) {
      console.error("Failed to open popout window");
      return;
    }

    // Copy styles
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));
    styles.forEach((style) => {
      this.popoutWindow!.document.head.appendChild(style.cloneNode(true));
    });

    // Add base styles for the body to match theme
    const bodyStyle = this.popoutWindow.document.createElement("style");
    bodyStyle.textContent = `
            body {
                background-color: var(--ls-primary-background-color, #fff);
                color: var(--ls-primary-text-color, #333);
                margin: 0;
                padding: 0;
                height: 100vh;
                display: flex;
                flex-direction: column;
            }
            #app {
                flex: 1;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            /* Force ChatContainer to fill height */
            #app .lda-chat-container {
                height: 100% !important;
                flex: 1 !important;
                display: flex !important;
                flex-direction: column !important;
                max-height: none !important;
            }
            /* Force messages list to fill remaining space */
            #app .lda-chat-messages {
                flex: 1 1 0% !important;
                height: auto !important;
                max-height: none !important;
                overflow-y: auto !important;
            }
        `;
    this.popoutWindow.document.head.appendChild(bodyStyle);

    // Create container
    const container = this.popoutWindow.document.createElement("div");
    container.id = "app";
    this.popoutWindow.document.body.appendChild(container);

    // Mount component
    this.popoutApp = mount(Component, {
      target: container,
      props: componentProps,
    });

    this.onStateChange(true);

    // Handle close
    this.popoutWindow.onbeforeunload = () => {
      if (this.popoutApp) {
        unmount(this.popoutApp);
        this.popoutApp = null;
      }
      this.onStateChange(false);
      this.popoutWindow = null;
    };
  }

  public restorePopout() {
    if (this.popoutWindow) {
      this.popoutWindow.close(); // This triggers onbeforeunload
    }
  }

  public close() {
    if (this.popoutWindow) {
      this.popoutWindow.close();
    }
  }
}
