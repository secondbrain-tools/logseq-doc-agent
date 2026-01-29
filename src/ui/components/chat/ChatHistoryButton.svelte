<script lang="ts">
    interface Props {
        onClick: () => void;
    }

    let { onClick }: Props = $props();

    function handleClick(e: MouseEvent) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (onClick) onClick();
    }

    function handleMouseDown(e: MouseEvent) {
        e.stopPropagation();
        e.stopImmediatePropagation();
    }

    function handleDragStart(e: DragEvent) {
        e.preventDefault();
        e.stopPropagation();
    }
</script>

<button
    class="ui__button inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm gap-1 font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none h-10 py-2 px-3"
    title="Chat History"
    type="button"
    draggable="false"
    onclick={handleClick}
    onmousedown={handleMouseDown}
    ondragstart={handleDragStart}
>
    <span class="ui__icon ti ls-icon-history">
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
    </span>
</button>
