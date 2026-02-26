import type { ChatPrompt } from '../../domain/chat/prompt';
import type { PromptRepository } from '../ports/prompt-repo';
import type { LogseqApi } from '../ports/logseq-ports';
import { LDA_NAMESPACE } from '../../domain/logseq/properties';

export class PromptTemplateService {
    constructor(
        private promptRepository: PromptRepository,
        private logseqApi: LogseqApi
    ) { }

    /**
     * Get the base prompt.
     * Uses the duplicate resolution logic: prefers outside LDA_NAMESPACE/prompts.
     */
    async getBasePrompt(): Promise<ChatPrompt | null> {
        return this.resolvePrompt('base');
    }

    /**
     * Resolves a prompt by name, applying collision rules and warnings.
     */
    async resolvePrompt(promptName: string): Promise<ChatPrompt | null> {
        const allPrompts = await this.promptRepository.getChatPrompts();
        const matchingPrompts = allPrompts.filter(p => p.name === promptName);

        if (matchingPrompts.length === 0) {
            return null;
        }

        if (matchingPrompts.length === 1) {
            return matchingPrompts[0];
        }

        // We have duplicates, apply resolution rules
        const namespacePrefix = `${LDA_NAMESPACE}/prompts`.toLowerCase();

        const inside = matchingPrompts.filter(p => p.pageName.toLowerCase().startsWith(namespacePrefix));
        const outside = matchingPrompts.filter(p => !p.pageName.toLowerCase().startsWith(namespacePrefix));

        if (outside.length > 0) {
            if (outside.length > 1) {
                this.warnUser(`Multiple prompts found with name "${promptName}" outside the namespace. Using the first one from page "${outside[0].pageName}".`);
            }
            return outside[0];
        }

        if (inside.length > 1) {
            this.warnUser(`Multiple prompts found with name "${promptName}" inside the namespace. Using the first one from page "${inside[0].pageName}".`);
        }
        return inside[0];
    }

    /**
     * Resolve the content string for a prompt by name.
     */
    async resolvePromptContent(promptName: string): Promise<string | null> {
        const prompt = await this.resolvePrompt(promptName);
        return prompt ? prompt.content : null;
    }

    /**
     * List all available non-base prompts for the UI picker.
     * Applies duplicate resolution so the UI only gets one entry per name.
     */
    async listPrompts(): Promise<ChatPrompt[]> {
        const allPrompts = await this.promptRepository.getChatPrompts();

        // Group by name
        const grouped = new Map<string, ChatPrompt[]>();
        for (const prompt of allPrompts) {
            if (prompt.isBase) continue; // Base prompt is auto-injected, not listed

            const group = grouped.get(prompt.name) || [];
            group.push(prompt);
            grouped.set(prompt.name, group);
        }

        const resolvedPrompts: ChatPrompt[] = [];
        const namespacePrefix = `${LDA_NAMESPACE}/prompts`.toLowerCase();

        for (const [name, prompts] of grouped.entries()) {
            if (prompts.length === 1) {
                resolvedPrompts.push(prompts[0]);
                continue;
            }

            const inside = prompts.filter(p => p.pageName.toLowerCase().startsWith(namespacePrefix));
            const outside = prompts.filter(p => !p.pageName.toLowerCase().startsWith(namespacePrefix));

            if (outside.length > 0) {
                resolvedPrompts.push(outside[0]);
            } else {
                resolvedPrompts.push(inside[0]);
            }
        }

        // Sort alphabetically by name
        return resolvedPrompts.sort((a, b) => a.name.localeCompare(b.name));
    }

    private warnUser(message: string) {
        console.warn(`[PromptTemplateService] ${message}`);
        this.logseqApi.UI.showMsg(message, 'warning');
    }
}
