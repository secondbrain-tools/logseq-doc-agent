import type { Prompt, FeedbackPrompt } from "../../domain/logseq";
import type { ChatPrompt } from "../../domain/chat/prompt";
import type { PromptRepository } from "../../application/ports/prompt-repo";
import type { LogseqApi } from "../../application/ports/logseq-ports";
import {
  LDA_PROMPT_NAME_PROPERTY,
  LDA_PROMPT_NAME_PROPERTY_CAMEL,
} from "../../domain/logseq/properties";

export class LogseqPromptRepository implements PromptRepository {
  constructor(private logseqApi: LogseqApi) {}

  async getFeedbackPrompts(): Promise<FeedbackPrompt[]> {
    const blocks = await this.logseqApi.queryBlocks("(property :doc-agent-feedback-prompt)");

    if (!blocks || !Array.isArray(blocks)) {
      return [];
    }

    return blocks.map((block) => ({
      id: block.uuid,
      content: block.content,
      type: "feedback",
    }));
  }

  async getChatPrompts(): Promise<ChatPrompt[]> {
    // Query for blocks with either logseq-doc-agent.prompt or logseqDocAgent.prompt
    const blocks = await this.logseqApi.q(`(property ${LDA_PROMPT_NAME_PROPERTY})`);

    if (!blocks || !Array.isArray(blocks)) {
      return [];
    }

    const prompts: ChatPrompt[] = [];

    for (const block of blocks) {
      try {
        const uuid = block.uuid || block.id;
        if (!uuid) continue;

        // Call getBlock to include children
        const fullBlock = (await this.logseqApi.getBlock(uuid, { includeChildren: true })) || block;

        // Extract name
        let name = "";
        if (fullBlock.properties) {
          name =
            fullBlock.properties[LDA_PROMPT_NAME_PROPERTY] ||
            fullBlock.properties[LDA_PROMPT_NAME_PROPERTY_CAMEL];
        }
        if (!name && fullBlock.content) {
          name =
            this.extractPropertyFromContent(fullBlock.content, LDA_PROMPT_NAME_PROPERTY) ||
            this.extractPropertyFromContent(fullBlock.content, LDA_PROMPT_NAME_PROPERTY_CAMEL) ||
            "";
        }

        if (!name) continue;

        // Extract content (filter out properties, include children)
        const content = await this.extractPrompt(fullBlock);

        // Page Name
        const page = block.page || {};
        const pageName = page.name || page["original-name"] || "";

        prompts.push({
          id: uuid,
          name,
          content,
          pageName,
          isBase: name === "system",
        });
      } catch (e) {
        console.error("[LogseqPromptRepository] Error parsing prompt block", block, e);
      }
    }

    return prompts;
  }

  private async extractPrompt(block: any): Promise<string> {
    let prompt = this.filterPropertyLines(block.content || "");

    // Add children content if present
    if (block.children && Array.isArray(block.children)) {
      const childTexts = await this.collectChildrenText(block.children);
      if (childTexts) {
        if (prompt.trim().length > 0) {
          prompt += "\n\n";
        }
        prompt += childTexts;
      }
    }

    return prompt;
  }

  /**
   * Collect children as markdown list lines so chat markdown rendering shows bullets and nesting.
   * Each level is indented with 2 spaces; list marker "- " is added so marked parses lists correctly.
   */
  private async collectChildrenText(children: any[], depth = 0): Promise<string> {
    const lines: string[] = [];
    const indent = "  ".repeat(depth);
    for (const child of children) {
      const raw = this.filterPropertyLines(child.content || "");
      if (raw) {
        const contentLines = raw.split("\n");
        const first = contentLines[0].replace(/^\s*-\s*/, "").trimStart();
        lines.push(`${indent}- ${first}`);
        for (let i = 1; i < contentLines.length; i++) {
          lines.push(`${indent}  ${contentLines[i]}`);
        }
      }
      if (child.children && Array.isArray(child.children)) {
        const nested = await this.collectChildrenText(child.children, depth + 1);
        if (nested) lines.push(nested);
      }
    }
    return lines.join("\n");
  }

  private filterPropertyLines(content: string): string {
    if (!content) return "";
    const lines = content.split("\n");
    const filtered = lines.filter((line) => {
      const trimmed = line.trim();
      // Strip markdown heading lines used as block title (e.g. ## Prompt Name)
      if (/^#+\s/.test(trimmed)) return false;
      // Strip all logseq-doc-agent.* and logseqDocAgent.* property lines
      const propMatch = trimmed.match(/^([^:]+)::\s*.+$/);
      if (propMatch) {
        const key = propMatch[1].trim();
        if (key.startsWith("logseq-doc-agent.") || key.startsWith("logseqDocAgent.")) {
          return false;
        }
      }
      return true;
    });
    return filtered.join("\n");
  }

  private extractPropertyFromContent(content: string, propertyName: string): string | null {
    if (!content) return null;
    const pattern = new RegExp(`${propertyName}::\\s*(.+)`);
    const match = content.match(pattern);
    return match ? match[1].trim() : null;
  }
}
