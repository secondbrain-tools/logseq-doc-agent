<script lang="ts">
    import SettingsProvider from "./SettingsProvider.svelte";
    import ChatInterface, { type Message } from "./ChatInterface.svelte";
    import type { Writable } from "svelte/store";

    interface Props {
        messages: Writable<Message[]>;
        isLoading: Writable<boolean>;
        onSendMessage: (text: string, modelId: string) => void;
        onClose: () => void;
    }

    let props: Props = $props();
</script>

<SettingsProvider>
    <ChatInterface {...props} />
</SettingsProvider>
