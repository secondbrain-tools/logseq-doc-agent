<script lang="ts">
    import SettingsProvider from "./SettingsProvider.svelte";
    import ChatInterface from "./ChatInterface.svelte";
    import type { Message } from "../../domain/chat/types";
    import type { Writable } from "svelte/store";

    interface Props {
        messages: Writable<Message[]>;
        isLoading: Writable<boolean>;
        onSendMessage: (
            text: string,
            modelId: string,
            providerId: string,
        ) => void;
        onClose: () => void;
    }

    let props: Props = $props();
</script>

<SettingsProvider>
    <ChatInterface {...props} />
</SettingsProvider>
