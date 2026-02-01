import { type AgentDefinition, ASK_AGENT_NAME, DEFAULT_AGENT_NAME } from './types';


export interface BuiltInAgentConfig {
    name: string;
    isDefault: boolean;
    tools: string;
    description: string;
    prompt: string;
    version: number;
}

export const builtInAgents: BuiltInAgentConfig[] = [
    {
        name: DEFAULT_AGENT_NAME,
        isDefault: true,
        tools: '*',
        description: 'Default agent with full tool access',
        prompt: `You are a helpful AI assistant for Logseq. You can help the user research, write, and manage their notes.

You have access to tools to read and modify the user's Logseq pages. Use them to help accomplish tasks.`,
        version: 1
    },
    {
        name: ASK_AGENT_NAME,
        isDefault: false,
        tools: 'readonly',
        description: 'Read-only agent for answering questions',
        prompt: `You are a helpful AI assistant for Logseq. You can help the user research, write, and manage their notes.

You have access to tools to read user's Logseq pages. Use them to support the user in their tasks.`,
        version: 1
    }
];
