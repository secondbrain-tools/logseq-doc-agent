
import { streamText, generateText } from 'ai';

/**
 * Manages the execution loop of the AI agent, handling both streaming and blocking modes,
 * tool execution, and message history management.
 */
export class AgentRunner {
    private readonly MAX_LOOPS = 5;

    constructor(
        private model: any,
        private toolsMap: any,
        private messages: any[],
        private disableStreaming: boolean
    ) { }

    /**
     * Starts the agent execution loop and returns a readable stream of events.
     * @returns {ReadableStream<any>} A stream of text deltas, tool calls, and tool results.
     */
    run(): ReadableStream<any> {
        // Capture context for the loop
        const currentMessages = [...this.messages];

        return new ReadableStream({
            start: async (controller) => {
                await this.runLoop(controller, currentMessages, 0);
            }
        });
    }

    /**
     * Recursive function that manages the execution loop steps: generation, tool execution, and recursion.
     * @param controller - The stream controller to enqueue events to.
     * @param currentMessages - The current history of messages.
     * @param loopCount - The current iteration of the loop (to prevent infinite loops).
     */
    private async runLoop(controller: ReadableStreamDefaultController, currentMessages: any[], loopCount: number) {
        if (loopCount >= this.MAX_LOOPS) {
            controller.close();
            return;
        }

        try {
            console.log(`[AgentRunner] Starting loop ${loopCount + 1}, messages: ${currentMessages.length}`);

            const toolsForStream = this.getToolsForStream();
            const { text, toolCalls } = await this.generateResponse(controller, currentMessages, toolsForStream);

            if (toolCalls.length > 0) {
                await this.handleToolCalls(controller, currentMessages, toolCalls);
                await this.runLoop(controller, currentMessages, loopCount + 1);
            } else {
                // No tool calls, we are done
                if (text) {
                    currentMessages.push({
                        role: 'assistant',
                        content: [{ type: 'text', text: text }]
                    });
                }
                controller.close();
            }
        } catch (err) {
            console.error('[AgentRunner] Error in manual loop:', err);
            controller.error(err);
        }
    }

    /**
     * Prepares the tools object for the AI SDK by stripping out the 'execute' method,
     * so that the SDK doesn't automatically execute them.
     * @returns {Object} Tools map without execution logic.
     */
    private getToolsForStream() {
        return Object.fromEntries(
            Object.entries(this.toolsMap).map(([k, v]) => {
                const { execute, ...rest } = v as any;
                return [k, rest];
            })
        );
    }

    /**
     * Generates a response from the model, either via streaming or blocking call, based on configuration.
     * @param controller - The stream controller.
     * @param messages - Message history.
     * @param tools - Tools available to the model.
     * @returns {Promise<{text: string, toolCalls: any[]}>} The generated text and tool calls.
     */
    private async generateResponse(controller: ReadableStreamDefaultController, messages: any[], tools: any): Promise<{ text: string, toolCalls: any[] }> {
        if (this.disableStreaming) {
            return this.generateBlocking(controller, messages, tools);
        } else {
            return this.generateStreaming(controller, messages, tools);
        }
    }

    /**
     * Generates a response using `generateText` (blocking implementation), effectively simulating a stream for the client.
     */
    private async generateBlocking(controller: ReadableStreamDefaultController, messages: any[], tools: any): Promise<{ text: string, toolCalls: any[] }> {
        const result = await generateText({
            model: this.model,
            messages: messages,
            tools: tools,
            maxSteps: 1,
        } as any);

        let accumulatedText = "";
        const accumulatedToolCalls: any[] = [];

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
                    args: (tc as any).args
                };
                controller.enqueue(toolCallChunk);
                accumulatedToolCalls.push(toolCallChunk);
            }
        }

        return { text: accumulatedText, toolCalls: accumulatedToolCalls };
    }

    /**
     * Generates a response using `streamText` (streaming implementation), forwarding all events to the client.
     */
    private async generateStreaming(controller: ReadableStreamDefaultController, messages: any[], tools: any): Promise<{ text: string, toolCalls: any[] }> {
        const result = streamText({
            model: this.model,
            messages: messages,
            tools: tools,
            maxSteps: 1,
        } as any);

        const reader = result.fullStream.getReader();
        let accumulatedText = "";
        const accumulatedToolCalls: any[] = [];

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

        return { text: accumulatedText, toolCalls: accumulatedToolCalls };
    }

    /**
     * Handles execution of tool calls, updating history, and emitting results to the stream.
     * @param controller - The stream controller.
     * @param currentMessages - Message history to update.
     * @param toolCalls - The tool calls to execute.
     */
    private async handleToolCalls(controller: ReadableStreamDefaultController, currentMessages: any[], toolCalls: any[]) {
        // 1. Append Assistant Message (Tool Call) to history
        currentMessages.push({
            role: 'assistant',
            content: toolCalls.map(tc => ({
                type: 'tool-call',
                toolCallId: tc.toolCallId,
                toolName: tc.toolName,
                input: tc.args || {} // Map args (from event) to input (for CoreMessage)
            }))
        });

        // 2. Execute Tools
        const toolResultParts: any[] = [];

        for (const tc of toolCalls) {
            const toolName = tc.toolName;
            const toolDef = (this.toolsMap as any)[toolName];

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
    }
}
