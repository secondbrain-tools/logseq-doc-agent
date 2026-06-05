export type Role = "user" | "assistant" | "system" | "tool";

export interface ContextItem {
  id: string; // UUID of the page or block
  type: "page" | "block";
  name: string; // Display name (page title or block preview)
}

export interface MessagePart {
  type: "content" | "reasoning" | "tool_call" | "tool_result" | "context" | "prompt";
  text?: string;
  toolCallId?: string; // Required for linking tool results to calls
  toolName?: string;
  toolArgs?: any;
  toolResult?: any;
  isCollapsed?: boolean; // UI state key, helps in UI persistence
  // Context specific fields
  contextName?: string;
  contextContent?: string;
  // Prompt specific fields
  promptName?: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;

  // Extended attributes for multi-part / personality
  personality?: "Agent" | "Subagent" | "Critic";
  personalityName?: string; // e.g. "BrowserTool"

  parts?: MessagePart[]; // For structured responses
}
