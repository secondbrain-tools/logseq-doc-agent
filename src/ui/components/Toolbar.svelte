<script lang="ts">
interface ToolbarItem {
  key: string;
  icon: string;
  title: string;
  onClick: () => void;
}

let { items = [] }: { items: ToolbarItem[] } = $props();
</script>

<div
  class="flex flex-row items-center gap-2 p-1 bg-gray-100 rounded shadow-sm border border-gray-200"
>
  {#each items as item}
    <button
      class="p-2 hover:bg-gray-200 rounded transition-colors text-gray-700"
      title={item.title}
      onclick={item.onClick}
      type="button"
    >
      <i class="ti {item.icon} text-lg"></i>
    </button>
  {/each}
</div>

<style>
  /* Basic Ti-icons shim if not present, rely on logseq-sim.html linking them or using svg fallback */
  /* Logseq uses tabler icons mostly now but legacy uses themify */
</style>
