
import { streamText, generateText } from 'ai';

export class AgentRunner {
    private readonly MAX_LOOPS = 5;

    constructor(
        private model: any,
        private toolsMap: any,
        private messages: any[],
        private disableStreaming: boolean
    ) { }

    run(): ReadableStream<any> {
        // Capture context for the loop
        const { model, toolsMap, disableStreaming, MAX_LOOPS } = this;
        let currentMessages = [...this.messages];
        let loopCount = 0;

        return new ReadableStream({
            async start(controller) {
                async function runLoop() {
                    if (loopCount >= MAX_LOOPS) {
                        controller.close();
                        return;
                    }
                    loopCount++;

                    try {
                        console.log(`[AgentRunner] Starting loop ${loopCount}, messages: ${currentMessages.length}`);

                        // Strip execute from tools for streamText to prevent auto-execution
                        // (We want streamText to just return the call, we execute manually)
                        const toolsForStream = Object.fromEntries(
                            Object.entries(toolsMap).map(([k, v]) => {
                                const { execute, ...rest } = v as any;
                                return [k, rest];
                            })
                        );

                        const accumulatedToolCalls: any[] = [];
                        let accumulatedText = "";

                        if (disableStreaming) {
                            // Blocking Mode (generateText)
                            const result = await generateText({
                                model,
                                messages: currentMessages as any[],
                                tools: toolsForStream as any,
                                maxSteps: 1,
                            } as any);

                            // Simulate Streaming for Client
                            if (result.text) {
                                controller.enqueue({ type: 'text-delta', textDelta: result.text });
                                accumulatedText = result.text;
                            }

                            if (result.toolCalls && result.toolCalls.length > 0) {
                                for (const tc of result.toolCalls) {
                                    const toolCallChunk = {
                                        type: 'tool-call',
                                        toolCallId: tc.toolCallId,
                                        toolName: tc.toolName,
                                        args: (tc as any).args // generateText Result has typed args
                                    };
                                    controller.enqueue(toolCallChunk);
                                    accumulatedToolCalls.push(toolCallChunk);
                                }
                            }

                        } else {
                            // Streaming Mode (streamText)
                            const result = streamText({
                                model,
                                messages: currentMessages as any[],
                                tools: toolsForStream as any,
                                maxSteps: 1, // Stop after generation
                            } as any);

                            const reader = result.fullStream.getReader();

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
                                const toolName = tc.toolName;
                                const toolDef = (toolsMap as any)[toolName];

                                let resultString = "Error: Tool not found";
                                if (toolDef && toolDef.execute) {
                                    try {
                                        // Ensure args is defined object (check input first per recent detailed logs)
                                        let args = tc.input || tc.args || {};
                                        if (typeof args === 'string') {
                                            try {
                                                args = JSON.parse(args);
                                            } catch (e) {
                                                console.error('[AgentRunner] Failed to parse args string:', args);
                                                args = {};
                                            }
                                        }

                                        const result = await toolDef.execute(args, { messages: currentMessages }); // Pass context if needed
                                        resultString = typeof result === 'string' ? result : JSON.stringify(result);
                                    } catch (err: any) {
                                        console.error(`[AgentRunner] Tool ${toolName} execution error:`, err);
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
                                    result: resultString
                                });
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
                            // Append the final text response to history (optional)
                            if (accumulatedText) {
                                currentMessages.push({
                                    role: 'assistant',
                                    content: [{ type: 'text', text: accumulatedText }]
                                });
                            }
                            controller.close();
                        }

                    } catch (err) {
                        console.error('[AgentRunner] Error in manual loop:', err);
                        controller.error(err);
                    }
                }

                runLoop();
            }
        });
    }
}
