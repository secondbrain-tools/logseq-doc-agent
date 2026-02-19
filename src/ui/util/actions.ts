export function clickAction(node: HTMLElement, fn: (e: MouseEvent) => void) {
    const handler = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        fn(e);
    };
    node.addEventListener('click', handler);
    return { destroy: () => node.removeEventListener('click', handler) };
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
            node.dispatchEvent(new CustomEvent('maxedout', { detail: true }));
        } else if (!isOverflowing && isMaxedOut) {
            isMaxedOut = false;
            node.dispatchEvent(new CustomEvent('maxedout', { detail: false }));
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
