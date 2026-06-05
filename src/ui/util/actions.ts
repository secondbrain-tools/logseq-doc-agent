export function clickAction(node: HTMLElement, fn: (e: MouseEvent) => void) {
  const handler = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn(e);
  };
  node.addEventListener("click", handler);
  return { destroy: () => node.removeEventListener("click", handler) };
}

/**
 * Svelte action that attaches a click handler directly on the element,
 * bypassing Svelte's event delegation. Use this instead of `onclick={...}`
 * in Logseq plugin context (iframe -> parent.document injection) to avoid
 * delegation failures across document boundaries.
 *
 * Unlike `clickAction`, does NOT call preventDefault or stopPropagation.
 */
export function clickHandler(node: HTMLElement, fn: (e: MouseEvent) => void) {
  node.addEventListener("click", fn);
  return { destroy: () => node.removeEventListener("click", fn) };
}

export function autoresize(node: HTMLTextAreaElement, _value: string) {
  let isMaxedOut = false;

  const resize = () => {
    node.style.height = "auto";
    const scrollHeight = node.scrollHeight;
    const maxHeight = 200; // Match the CSS max-height logic or implicit

    node.style.height = `${Math.min(scrollHeight, maxHeight)}px`;

    const isOverflowing = scrollHeight > maxHeight;
    node.style.overflowY = isOverflowing ? "auto" : "hidden";

    // Dispatch optional custom event if maxed out state changes
    if (isOverflowing && !isMaxedOut) {
      isMaxedOut = true;
      node.dispatchEvent(new CustomEvent("maxedout", { detail: true }));
    } else if (!isOverflowing && isMaxedOut) {
      isMaxedOut = false;
      node.dispatchEvent(new CustomEvent("maxedout", { detail: false }));
    }
  };

  node.addEventListener("input", resize);
  // Call resize initially to set state
  setTimeout(resize, 0);

  return {
    update(_newValue: string) {
      resize();
    },
    destroy() {
      node.removeEventListener("input", resize);
    },
  };
}
