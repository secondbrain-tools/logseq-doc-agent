<script lang="ts">
    import SettingsProvider from "../SettingsProvider.svelte";
    import ChatInterface from "./ChatInterface.svelte";
    import type { Message } from "../../../domain/chat/types";
    import type { ChatlogMetadata } from "../../../domain/chatlog/types";
    import type { Writable } from "svelte/store";

    interface Props {
        messages: Writable<Message[]>;
        isLoading: Writable<boolean>;
        currentChatlogId?: Writable<string | null>;
        historyModalOpen?: Writable<boolean>;
        isMergeOn?: Writable<boolean>;
        focusSignal?: Writable<number>;
        expandSignal?: Writable<number>;
        showContinueButton?: Writable<boolean>;
        onContinue?: () => void;
        onSendMessage: (
            text: string,
            modelId: string,
            providerId: string,
            merge: boolean,
            reasoningEffort?: "none" | "low" | "medium" | "high",
            agentName?: string,
            contextItems?: any[],
            selectedPrompts?: string[],
        ) => void;
        onClose: () => void;
        onReset: () => void;
        onNewChat?: () => void;
        onLoadChatlog?: (id: string) => void;
        onListChatlogs?: () => Promise<ChatlogMetadata[]>;
        onDeleteChatlog?: (id: string) => void;
        onStop?: () => void;
        onAgentListOpen?: () => void;
    }

    let props: Props = $props();
</script>

<SettingsProvider>
    <ChatInterface {...props} />
</SettingsProvider>
