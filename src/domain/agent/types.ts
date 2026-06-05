/**
 * Agent definition types for configurable AI agents in Logseq
 */

export interface BuiltInAgentConfig {
  name: string;
  isDefault: boolean;
  tools: string;
  description: string;
  prompt: string;
  version: number;
}

export interface AgentDefinition {
  /** UUID of the block containing the agent definition */
  id: string;

  /** Resolved name (after duplicate resolution with prefix/postfix) */
  name: string;

  /** Original name from logseq-doc-agent.agent property */
  rawName: string;

  /** Allowed tools (default: ['*'] for all) */
  tools: string[];

  /** Whether agent is enabled (default: true) */
  enabled: boolean;

  /** Agent version (default: 0) */
  version: number;

  /** Whether this is the default agent (default: false) */
  isDefault: boolean;

  /** Optional description */
  description?: string;

  /** Agent system prompt (block content + subtree text) */
  prompt: string;

  /** Page name where agent is defined */
  pageName: string;

  /** Whether agent is defined in logseq-root folder */
  isInLogseqRoot: boolean;
}

export interface AgentContext {
  /** Agent's system prompt to prepend */
  prompt: string;

  /** Tools to enable: '*' for all, 'readonly' for read-only, or specific names */
  allowedTools: string[];

  /** Agent name for display/logging */
  agentName: string;
}

/** Default agent name constant */
export const DEFAULT_AGENT_NAME = "Default Agent";
/** Read-only Ask agent name constant */
export const ASK_AGENT_NAME = "Ask";

/** Tool categories for filtering */
export const READONLY_TOOLS = ["getLogseqDocument"] as const;
export const WRITE_TOOLS = ["updateBlock", "addBlock", "deleteBlock", "moveBlock"] as const;
export const ALL_TOOLS = [...READONLY_TOOLS, ...WRITE_TOOLS] as const;
