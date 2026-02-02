export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface MessagePart {
    type: 'content' | 'reasoning' | 'tool_call' | 'tool_result' | 'context';
    text?: string;
    toolCallId?: string; // Required for linking tool results to calls
    toolName?: string;
    toolArgs?: any;
    toolResult?: any;
    isCollapsed?: boolean; // UI state key, helps in UI persistence
    // Context specific fields
    contextName?: string;
    contextContent?: string;
}

export interface Message {
    id: string;
    role: Role;
    content: string;

    // Extended attributes for multi-part / personality
    personality?: 'Agent' | 'Subagent' | 'Critic';
    personalityName?: string; // e.g. "BrowserTool"

    parts?: MessagePart[]; // For structured responses
}
