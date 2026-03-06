import type { Prompt, FeedbackPrompt } from '../../domain/logseq';
import type { ChatPrompt } from '../../domain/chat/prompt';
import type { PromptRepository } from '../../application/ports/prompt-repo';
import type { LogseqApi } from '../../application/ports/logseq-ports';
import { LDA_PROMPT_NAME_PROPERTY, LDA_PROMPT_NAME_PROPERTY_CAMEL } from '../../domain/logseq/properties';

export class LogseqPromptRepository implements PromptRepository {
    constructor(private logseqApi: LogseqApi) { }

    async getFeedbackPrompts(): Promise<FeedbackPrompt[]> {
        const blocks = await this.logseqApi.queryBlocks('(property :doc-agent-feedback-prompt)');

        if (!blocks || !Array.isArray(blocks)) {
            return [];
        }

        return blocks.map(block => ({
            id: block.uuid,
            content: block.content,
            type: 'feedback'
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
                const fullBlock = await this.logseqApi.getBlock(uuid, { includeChildren: true }) || block;

                // Extract name
                let name = '';
                if (fullBlock.properties) {
                    name = fullBlock.properties[LDA_PROMPT_NAME_PROPERTY] || fullBlock.properties[LDA_PROMPT_NAME_PROPERTY_CAMEL];
                }
                if (!name && fullBlock.content) {
                    name = this.extractPropertyFromContent(fullBlock.content, LDA_PROMPT_NAME_PROPERTY) ||
                        this.extractPropertyFromContent(fullBlock.content, LDA_PROMPT_NAME_PROPERTY_CAMEL) || '';
                }

                if (!name) continue;

                // Extract content (filter out properties, include children)
                const content = await this.extractPrompt(fullBlock);

                // Page Name
                const page = block.page || {};
                const pageName = page.name || page['original-name'] || '';

                prompts.push({
                    id: uuid,
                    name,
                    content,
                    pageName,
                    isBase: name === 'base'
                });
            } catch (e) {
                console.error('[LogseqPromptRepository] Error parsing prompt block', block, e);
            }
        }

        return prompts;
    }

    private async extractPrompt(block: any): Promise<string> {
        let prompt = this.filterPropertyLines(block.content || '');

        // Add children content if present
        if (block.children && Array.isArray(block.children)) {
            const childTexts = await this.collectChildrenText(block.children);
            if (childTexts) {
                if (prompt.trim().length > 0) {
                    prompt += '\n\n';
                }
                prompt += childTexts;
            }
        }

        return prompt;
    }

    private async collectChildrenText(children: any[]): Promise<string> {
        const texts: string[] = [];
        for (const child of children) {
            const text = this.filterPropertyLines(child.content || '');
            if (text) texts.push(text);

            if (child.children && Array.isArray(child.children)) {
                const nestedText = await this.collectChildrenText(child.children);
                if (nestedText) texts.push(nestedText);
            }
        }
        return texts.join('\n');
    }

    private filterPropertyLines(content: string): string {
        if (!content) return '';
        const lines = content.split('\n');
        return lines
            .map(l => l.trim())
            .filter(line => line && !/^[^:]+::\s*.+$/.test(line))
            .join('\n');
    }

    private extractPropertyFromContent(content: string, propertyName: string): string | null {
        if (!content) return null;
        const pattern = new RegExp(`${propertyName}::\\s*(.+)`);
        const match = content.match(pattern);
        return match ? match[1].trim() : null;
    }
}
