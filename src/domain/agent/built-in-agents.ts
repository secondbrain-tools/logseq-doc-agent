

import { DEFAULT_AGENT_CONFIG } from './default.agent';
import { ASK_AGENT_CONFIG } from './ask.agent';

export interface BuiltInAgentConfig {
    name: string;
    isDefault: boolean;
    tools: string;
    description: string;
    prompt: string;
    version: number;
}

export const builtInAgents: BuiltInAgentConfig[] = [
    DEFAULT_AGENT_CONFIG,
    ASK_AGENT_CONFIG
];
