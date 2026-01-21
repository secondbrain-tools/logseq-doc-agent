export type Role = 'user' | 'assistant' | 'system';

export interface MessagePart {
    type: 'content' | 'reasoning' | 'tool_call' | 'tool_result';
    text?: string;
    toolName?: string;
    toolArgs?: any;
    toolResult?: any;
    isCollapsed?: boolean; // UI state key, helps in UI persistence
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
