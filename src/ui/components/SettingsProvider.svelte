<script lang="ts">
    import { onMount, setContext } from "svelte";
    import { writable } from "svelte/store";

    interface Props {
        children?: import("svelte").Snippet;
    }

    let { children }: Props = $props();

    // Create a writable store for settings
    const settingsStore = writable<any>({});

    // Provide the store to children
    setContext("settings", settingsStore);

    onMount(() => {
        const updateSettings = () => {
            const settings = (window as any).logseq?.settings || {};
            settingsStore.set(settings);
        };

        // Initial load
        updateSettings();

        // Listen for changes
        // Note: logseq.on('settings:changed') might be the way, provided we are in a context where logseq is available.
        // If we are in an iframe, we rely on the main thread or standard logseq events.
        if ((window as any).logseq) {
            (window as any).logseq.on(
                "settings:changed",
                (newSettings: any) => {
                    settingsStore.set(newSettings);
                },
            );
        }

        return () => {
            if ((window as any).logseq) {
                (window as any).logseq.off("settings:changed");
            }
        };
    });
</script>

{@render children?.()}
