
import type { Message } from '../../domain/chat/types';
import type { CoreMessage, ToolCallPart, ToolResultPart, TextPart, CoreAssistantMessage, CoreToolMessage, CoreUserMessage, CoreSystemMessage } from 'ai';

export function mapMessages(messages: Message[]): CoreMessage[] {
    const flatMessages = messages.flatMap(m => {
        // 1. User Message
        if (m.role === 'user') {
            const userMsg: CoreUserMessage = {
                role: 'user',
                content: [{ type: 'text', text: m.content }]
            };
            return [userMsg];
        }

        // 2. Assistant Message
        if (m.role === 'assistant') {
            if (m.parts && m.parts.length > 0) {
                const resultMessages: CoreMessage[] = [];
                let currentAssistantContent: Array<TextPart | ToolCallPart> = [];
                let currentToolResults: Array<ToolResultPart> = [];

                for (const p of m.parts) {
                    if (p.type === 'tool_call') {
                        // Flush pending tool results if any (unlikely sequence but safe)
                        if (currentToolResults.length > 0) {
                            resultMessages.push({ role: 'tool', content: [...currentToolResults] });
                            currentToolResults = [];
                        }

                        currentAssistantContent.push({
                            type: 'tool-call',
                            toolCallId: p.toolCallId || 'unknown',
                            toolName: p.toolName,
                            input: p.toolArgs || {} // Mapped from toolArgs to input
                        });
                    } else if (p.type === 'tool_result') {
                        // Flush pending assistant content if any
                        if (currentAssistantContent.length > 0) {
                            resultMessages.push({ role: 'assistant', content: [...currentAssistantContent] });
                            currentAssistantContent = [];
                        }

                        const resultVal = typeof p.toolResult === 'object' ? JSON.stringify(p.toolResult) : String(p.toolResult);

                        currentToolResults.push({
                            type: 'tool-result',
                            toolCallId: p.toolCallId || 'unknown',
                            toolName: p.toolName,
                            output: { // Mapped to strict output schema
                                type: 'text',
                                value: resultVal
                            }
                        } as any); // Cast because SDK type definition might be slightly different in installed version vs locally inferred
                    } else {
                        // Text or other content
                        if (currentToolResults.length > 0) {
                            resultMessages.push({ role: 'tool', content: [...currentToolResults] });
                            currentToolResults = [];
                        }

                        currentAssistantContent.push({
                            type: 'text',
                            text: p.text || (p.type === 'content' ? m.content : '')
                        });
                    }
                }

                // Flush remainders
                if (currentAssistantContent.length > 0) {
                    resultMessages.push({ role: 'assistant', content: currentAssistantContent });
                }
                if (currentToolResults.length > 0) {
                    resultMessages.push({ role: 'tool', content: currentToolResults });
                }

                return resultMessages;
            }

            // Fallback: Assistant text content
            const hasTextContent = m.content && m.content.trim().length > 0;
            if (!hasTextContent) return [];

            return [{ role: 'assistant', content: [{ type: 'text', text: m.content }] }] as CoreMessage[];
        }

        // 3. Tool Message (Fallback)
        if (m.role === 'tool') {
            if (m.parts && m.parts.length > 0) {
                const content = m.parts.map(p => {
                    if (p.type === 'tool_result') {
                        const resultVal = typeof p.toolResult === 'object' ? JSON.stringify(p.toolResult) : String(p.toolResult);
                        return {
                            type: 'tool-result',
                            toolCallId: p.toolCallId || 'unknown',
                            toolName: p.toolName,
                            output: {
                                type: 'text',
                                value: resultVal
                            }
                        };
                    }
                    return null;
                }).filter((item): item is any => item !== null);

                if (content.length === 0) return [];
                return [{ role: 'tool', content }] as CoreMessage[];
            }
            return [];
        }

        // 4. System Message
        if (m.role === 'system') {
            const sysMsg: CoreSystemMessage = {
                role: 'system',
                content: m.content || "" // Strict string content
            };
            return [sysMsg];
        }

        // 5. Default Fallback
        return [{
            role: m.role as any,
            content: [{ type: 'text', text: m.content || "" }]
        }] as CoreMessage[];
    });

    // Post-processing: Fix formatting issues (e.g. Tool message followed by User message without Assistant response)
    const fixedMessages: CoreMessage[] = [];
    for (let i = 0; i < flatMessages.length; i++) {
        const current = flatMessages[i];
        const next = flatMessages[i + 1];

        fixedMessages.push(current);

        // If current is Tool and next is User, we are missing an Assistant response.
        if (current.role === 'tool' && next && next.role === 'user') {
            fixedMessages.push({
                role: 'assistant',
                content: [{ type: 'text', text: "(Tool execution completed)" }]
            });
        }
    }

    return fixedMessages;
}
