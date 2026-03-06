import { ASK_AGENT_NAME } from './types';
import type { BuiltInAgentConfig } from './built-in-agents';

export const ASK_AGENT_CONFIG: BuiltInAgentConfig = {
    name: ASK_AGENT_NAME,
    isDefault: false,
    tools: 'readonly',
    description: 'Read-only agent for answering questions',
    prompt: `You are a helpful AI assistant for Logseq. You can help the user research, write, and manage their notes.

You have access to tools to read user's Logseq pages. Use them to support the user in their tasks.`,
    version: 2
};
