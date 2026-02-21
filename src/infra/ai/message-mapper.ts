
import type { Message } from '../../domain/chat/types';
import type { ModelMessage, ToolCallPart, ToolResultPart, TextPart, AssistantModelMessage, ToolModelMessage, UserModelMessage, SystemModelMessage } from 'ai';

export function mapMessages(messages: Message[]): ModelMessage[] {
    const flatMessages = messages.flatMap(m => {
        // 1. User Message
        if (m.role === 'user') {
            let contentText = m.content;

            // Append context parts if present
            if (m.parts && m.parts.length > 0) {
                const contextParts = m.parts
                    .filter(p => p.type === 'context')
                    .map(p => p.text || '')
                    .join('');

                if (contextParts) {
                    // Start of execution logic - we might append it using a newline separator if content exists
                    // However, chat-sidebar.usecase.ts constructs the text with newlines already in the 'text' field of the part?
                    // Let's assume the text field in the part contains the formatted string.
                    // But wait, if we change the usecase to separate them, we need to ensure concatenation happens here for the LLM.
                    // The plan says: "Map context parts to text blocks for the AI model"
                    // The usecase will put the formatted string into part.text.

                    // We append context to the main content.
                    contentText += contextParts;
                }
            }

            const userMsg: UserModelMessage = {
                role: 'user',
                content: [{ type: 'text', text: contentText }]
            };
            return [userMsg];
        }

        // 2. Assistant Message
        if (m.role === 'assistant') {
            if (m.parts && m.parts.length > 0) {
                const resultMessages: ModelMessage[] = [];
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
                            toolName: p.toolName || 'unknown',
                            input: p.toolArgs || {}
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

            return [{ role: 'assistant', content: [{ type: 'text', text: m.content }] }] as ModelMessage[];
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
                return [{ role: 'tool', content }] as ModelMessage[];
            }
            return [];
        }

        // 4. System Message
        if (m.role === 'system') {
            const sysMsg: SystemModelMessage = {
                role: 'system',
                content: m.content || "" // Strict string content
            };
            return [sysMsg];
        }

        // 5. Default Fallback
        return [{
            role: m.role as any,
            content: [{ type: 'text', text: m.content || "" }]
        }] as ModelMessage[];
    });

    // Post-processing: Fix formatting issues (e.g. Tool message followed by User message without Assistant response)
    const fixedMessages: ModelMessage[] = [];
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
