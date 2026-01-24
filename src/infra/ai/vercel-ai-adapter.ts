
// @ts-ignore
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createTools } from './tools/index';
import type { IAIService } from '../../application/ports/ai-service';
import type { Message } from '../../domain/chat/types';

export class VercelAIAdapter implements IAIService {
    // ... cache for models ...
    private models: Map<string, any> = new Map();

    private createModel(modelId: string, providerId: string) {
        const key = `${providerId}:${modelId}`;
        if (this.models.has(key)) {
            return this.models.get(key);
        }

        // Access logseq settings from window object safely
        const logseq = (window as any).logseq;
        const settings = logseq?.settings || {};

        // Note: Settings keys are defined in src/domain/settings/index.ts and are camelCase
        // e.g. 'openaiApiKey', 'anthropicApiKey'
        const apiKey = settings[`${providerId}ApiKey`] as string;

        if (!apiKey) {
            throw new Error(`API key for provider ${providerId} not found in settings.`);
        }

        let model;
        if (providerId === 'openai') {
            const openai = createOpenAI({
                apiKey: apiKey,
            });
            model = openai(modelId);
        } else if (providerId === 'anthropic') {
            const anthropic = createAnthropic({
                apiKey: apiKey,
            });
            model = anthropic(modelId);
        } else {
            throw new Error(`Provider ${providerId} not supported yet.`);
        }

        this.models.set(key, model);
        return model;
    }

    async streamResponse(messages: Message[], modelId: string, providerId: string, merge: boolean = true): Promise<ReadableStream<any>> {
        console.log('[VercelAIAdapter] streamResponse called (MANUAL LOOP)', { modelId, providerId, merge });
        const model = this.createModel(modelId, providerId);
        const toolsMap = createTools({ merge });
        const coreMessages = this.mapMessages(messages);

        const MAX_LOOPS = 5;

        return new ReadableStream({
            async start(controller) {
                let currentMessages = [...coreMessages];
                let loopCount = 0;

                async function runLoop() {
                    if (loopCount >= MAX_LOOPS) {
                        controller.close();
                        return;
                    }
                    loopCount++;

                    try {
                        console.log(`[VercelAIAdapter] Starting loop ${loopCount}, messages: ${currentMessages.length}`);

                        // Strip execute from tools for streamText to prevent auto-execution
                        // (We want streamText to just return the call, we execute manually)
                        const toolsForStream = Object.fromEntries(
                            Object.entries(toolsMap).map(([k, v]) => {
                                const { execute, ...rest } = v as any;
                                return [k, rest];
                            })
                        );

                        const result = streamText({
                            model,
                            messages: currentMessages as any[],
                            tools: toolsForStream as any,
                            maxSteps: 1, // Stop after generation
                        } as any);

                        const reader = result.fullStream.getReader();
                        const accumulatedToolCalls: any[] = [];
                        let accumulatedText = "";

                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;

                            const type = (value as any).type;

                            // Forward everything to client
                            controller.enqueue(value);

                            if (type === 'tool-call') {
                                accumulatedToolCalls.push(value);
                            } else if (type === 'text-delta') {
                                accumulatedText += (value as any).textDelta;
                            }
                        }

                        // Determine if we need to loop
                        if (accumulatedToolCalls.length > 0) {
                            // 1. Append Assistant Message (Tool Call) to history
                            currentMessages.push({
                                role: 'assistant',
                                content: accumulatedToolCalls.map(tc => ({
                                    type: 'tool-call',
                                    toolCallId: tc.toolCallId,
                                    toolName: tc.toolName,
                                    input: tc.args || {} // Map args (from event) to input (for CoreMessage)
                                }))
                            });

                            // 2. Execute Tools
                            const toolResultParts: any[] = [];

                            for (const tc of accumulatedToolCalls) {
                                console.log('[VercelAIAdapter] Processing tool call:', JSON.stringify(tc));
                                const toolName = tc.toolName;
                                const toolDef = (toolsMap as any)[toolName];

                                let resultString = "Error: Tool not found";
                                if (toolDef && toolDef.execute) {
                                    try {
                                        console.log(`[VercelAIAdapter] Executing tool ${toolName}`);
                                        // Ensure args is defined object (check input first per recent detailed logs)
                                        let args = tc.input || tc.args || {};
                                        if (typeof args === 'string') {
                                            try {
                                                args = JSON.parse(args);
                                            } catch (e) {
                                                console.error('[VercelAIAdapter] Failed to parse args string:', args);
                                                args = {};
                                            }
                                        }
                                        console.log('[VercelAIAdapter] Final execution args:', JSON.stringify(args));

                                        const result = await toolDef.execute(args, { messages: currentMessages }); // Pass context if needed
                                        resultString = typeof result === 'string' ? result : JSON.stringify(result);
                                        console.log(`[VercelAIAdapter] Tool ${toolName} executed. Result length: ${resultString.length}`);
                                    } catch (err: any) {
                                        console.error(`[VercelAIAdapter] Tool ${toolName} execution error:`, err);
                                        resultString = `Error executing tool: ${err.message}`;
                                    }
                                }

                                const toolResultPart = {
                                    type: 'tool-result',
                                    toolCallId: tc.toolCallId,
                                    toolName: toolName,
                                    output: { // Use strict output structure
                                        type: 'text',
                                        value: resultString
                                    }
                                };

                                toolResultParts.push(toolResultPart);

                                // 3. Emit Tool Result to Client (Client expects this chunk)
                                controller.enqueue({
                                    type: 'tool-result',
                                    toolCallId: tc.toolCallId,
                                    toolName: toolName,
                                    result: resultString // Client might expect 'result' property in the chunk event? keeping both is safe for client consumption if it uses result
                                });
                                // Note: The client logic I saw earlier uses `toolResult: toolResult.result`. 
                                // So I should emit a chunk that has `result`. 
                                // BUT internally for history, I MUST use `output`.
                            }

                            // 4. Append Tool Message (Results) to history
                            currentMessages.push({
                                role: 'tool',
                                content: toolResultParts
                            });

                            // 5. Recurse
                            await runLoop();

                        } else {
                            // No tool calls, we are done
                            // Append the final text response to history (optional, for completeness if we persisted)
                            if (accumulatedText) {
                                currentMessages.push({
                                    role: 'assistant',
                                    content: [{ type: 'text', text: accumulatedText }]
                                });
                            }
                            controller.close();
                        }

                    } catch (err) {
                        console.error('[VercelAIAdapter] Error in manual loop:', err);
                        controller.error(err);
                    }
                }

                runLoop();
            }
        });
    }

    private mapMessages(messages: Message[]): any[] {
        const flatMessages = messages.flatMap(m => { // Use flatMap to allow 1:N mapping
            if (m.role === 'user') {
                return [{
                    role: 'user',
                    content: [{ type: 'text', text: m.content }]
                }];
            }

            if (m.role === 'assistant') {
                if (m.parts && m.parts.length > 0) {
                    const resultMessages: any[] = [];

                    let currentAssistantContent: any[] = [];
                    let currentToolResults: any[] = [];

                    for (const p of m.parts) {
                        if (p.type === 'tool_call') {
                            // If we have pending tool results, push them as a Tool message first (unlikely in standard flow but safe)
                            if (currentToolResults.length > 0) {
                                resultMessages.push({ role: 'tool', content: [...currentToolResults] });
                                currentToolResults = [];
                            }

                            currentAssistantContent.push({
                                type: 'tool-call',
                                toolCallId: p.toolCallId || 'unknown',
                                toolName: p.toolName,
                                input: p.toolArgs || {} // Renamed args to input per Schema
                            });
                        } else if (p.type === 'tool_result') {
                            // Push pending assistant content if any
                            if (currentAssistantContent.length > 0) {
                                resultMessages.push({ role: 'assistant', content: [...currentAssistantContent] });
                                currentAssistantContent = [];
                            }

                            const resultVal = typeof p.toolResult === 'object' ? JSON.stringify(p.toolResult) : String(p.toolResult);

                            currentToolResults.push({
                                type: 'tool-result',
                                toolCallId: p.toolCallId || 'unknown',
                                toolName: p.toolName,
                                output: { // Use strict output structure
                                    type: 'text',
                                    value: resultVal
                                }
                            });
                        } else {
                            // Text or other content
                            // If we have pending tool results, push them as a Tool message. 
                            // This signals the end of the tool turn and start of new assistant text.
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
                // If message has no content and no parts, skip it
                const hasTextContent = m.content && m.content.trim().length > 0;
                const hasParts = m.parts && m.parts.length > 0;

                if (!hasTextContent && !hasParts) {
                    return [];
                }

                // If we are here, it means no parts (or empty parts array).
                // So we only check text content.
                if (!hasTextContent) {
                    return [];
                }

                return [{ role: 'assistant', content: [{ type: 'text', text: m.content }] }];
            }

            if (m.role === 'tool') {
                if (m.parts && m.parts.length > 0) {
                    const content = m.parts.map(p => {
                        if (p.type === 'tool_result') {
                            const resultVal = typeof p.toolResult === 'object' ? JSON.stringify(p.toolResult) : String(p.toolResult);
                            return {
                                type: 'tool-result',
                                toolCallId: p.toolCallId || 'unknown',
                                toolName: p.toolName,
                                output: { // Use strict output structure
                                    type: 'text',
                                    value: resultVal
                                }
                            };
                        }
                        return null;
                    }).filter(item => item !== null); // Strict filter

                    if (content.length === 0) return [];

                    return [{ role: 'tool', content }];
                }
                return []; // Skip empty tool messages
            }

            // Fallback for system or other roles
            if (m.role === 'system') {
                return [{
                    role: 'system',
                    content: m.content || ""
                }];
            }
            // Other roles (e.g. data?)
            return [{
                role: m.role,
                content: [{ type: 'text', text: m.content || "" }]
            }];
        });

        // Post-processing to fix sequences if needed (e.g. Tool -> User)
        const fixedMessages: any[] = [];
        for (let i = 0; i < flatMessages.length; i++) {
            const current = flatMessages[i];
            const next = flatMessages[i + 1];

            fixedMessages.push(current);

            // Inject assistant placeholder if Tool -> User detected
            if (current.role === 'tool' && next && next.role === 'user') {
                // console.warn('[VercelAIAdapter] Detected Tool -> User transition. Injecting placeholder.');
                fixedMessages.push({
                    role: 'assistant',
                    content: [{ type: 'text', text: "(Tool execution completed)" }]
                });
            }
        }

        return fixedMessages;
    }
}
