
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentRunner } from './agent-runner';

// Mock dependencies
const mockGenerateText = vi.fn();
const mockStreamText = vi.fn();

vi.mock('ai', () => ({
    generateText: (...args: any[]) => mockGenerateText(...args),
    streamText: (...args: any[]) => mockStreamText(...args),
}));

describe('AgentRunner', () => {
    const mockModel = {};
    const mockToolsMap = {
        testTool: {
            execute: vi.fn().mockResolvedValue('tool_result_value'),
            parameters: {}
        }
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should handle streaming mode correctly', async () => {
        // Mock streamText to return a stream of events
        const streamEvents = [
            { type: 'text-delta', textDelta: 'Hello' },
            { type: 'text-delta', textDelta: ' World' }
        ];

        mockStreamText.mockReturnValue({
            fullStream: new ReadableStream({
                start(controller) {
                    streamEvents.forEach(e => controller.enqueue(e));
                    controller.close();
                }
            })
        });

        const runner = new AgentRunner(mockModel, mockToolsMap, [], false);
        const stream = runner.run();
        const reader = stream.getReader();

        const receivedEvents = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            receivedEvents.push(value);
        }

        expect(mockStreamText).toHaveBeenCalled();
        expect(receivedEvents).toEqual(streamEvents);
    });

    it('should handle blocking mode (generateText) correctly', async () => {
        // Mock generateText to return a result
        mockGenerateText.mockResolvedValue({
            text: 'Hello Blocking World',
            toolCalls: []
        });

        const runner = new AgentRunner(mockModel, mockToolsMap, [], true);
        const stream = runner.run();
        const reader = stream.getReader();

        const receivedEvents = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            receivedEvents.push(value);
        }

        expect(mockGenerateText).toHaveBeenCalled();
        expect(receivedEvents).toHaveLength(1);
        expect(receivedEvents[0]).toEqual({ type: 'text-delta', textDelta: 'Hello Blocking World' });
    });

    it('should execute tools and loop in blocking mode', async () => {
        // 1st call: returns tool call
        mockGenerateText.mockResolvedValueOnce({
            text: 'Let me check',
            toolCalls: [{
                toolCallId: 'tc1',
                toolName: 'testTool',
                args: { query: 'something' }
            }]
        });

        // 2nd call: returns final answer
        mockGenerateText.mockResolvedValueOnce({
            text: 'Final Answer',
            toolCalls: []
        });

        const runner = new AgentRunner(mockModel, mockToolsMap, [], true);
        const stream = runner.run();
        const reader = stream.getReader();

        const receivedEvents = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            receivedEvents.push(value);
        }

        // Verify correct sequence of events
        // 1. Text delta "Let me check"
        // 2. Tool call "tc1"
        // 3. Tool result "tc1" (simulated by manual loop)
        // 4. Text delta "Final Answer"

        expect(receivedEvents).toHaveLength(4);
        expect(receivedEvents[0]).toEqual({ type: 'text-delta', textDelta: 'Let me check' });
        expect(receivedEvents[1]).toEqual({
            type: 'tool-call',
            toolCallId: 'tc1',
            toolName: 'testTool',
            args: { query: 'something' }
        });
        expect(receivedEvents[2]).toEqual({
            type: 'tool-result',
            toolCallId: 'tc1',
            toolName: 'testTool',
            result: 'tool_result_value'
        });
        expect(receivedEvents[3]).toEqual({ type: 'text-delta', textDelta: 'Final Answer' });

        // Verify tool execution
        expect(mockToolsMap.testTool.execute).toHaveBeenCalledWith({ query: 'something' }, expect.any(Object));

        // Verify generateText call count
        expect(mockGenerateText).toHaveBeenCalledTimes(2);
    });

    it('should execute tools and loop in streaming mode', async () => {
        // 1. Stream tool call
        mockStreamText.mockReturnValueOnce({
            fullStream: new ReadableStream({
                start(controller) {
                    controller.enqueue({ type: 'text-delta', textDelta: 'Thinking...' });
                    controller.enqueue({
                        type: 'tool-call',
                        toolCallId: 'tc2',
                        toolName: 'testTool',
                        args: { input: 'xyz' } // streamText events usually have args
                    });
                    controller.close();
                }
            })
        });

        // 2. Stream final response
        mockStreamText.mockReturnValueOnce({
            fullStream: new ReadableStream({
                start(controller) {
                    controller.enqueue({ type: 'text-delta', textDelta: 'Done' });
                    controller.close();
                }
            })
        });

        const runner = new AgentRunner(mockModel, mockToolsMap, [], false);
        const stream = runner.run();
        const reader = stream.getReader();

        const receivedEvents = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            receivedEvents.push(value);
        }

        expect(receivedEvents).toHaveLength(4);
        expect(receivedEvents[0]).toEqual({ type: 'text-delta', textDelta: 'Thinking...' });
        expect(receivedEvents[1]).toEqual({ type: 'tool-call', toolCallId: 'tc2', toolName: 'testTool', args: { input: 'xyz' } });
        expect(receivedEvents[2]).toEqual({ type: 'tool-result', toolCallId: 'tc2', toolName: 'testTool', result: 'tool_result_value' });
        expect(receivedEvents[3]).toEqual({ type: 'text-delta', textDelta: 'Done' });

        expect(mockToolsMap.testTool.execute).toHaveBeenCalled();
        expect(mockStreamText).toHaveBeenCalledTimes(2);
    });

    it('should stop looping after MAX_LOOPS', async () => {
        // Always return a tool call to force looping
        mockGenerateText.mockResolvedValue({
            text: 'Looping',
            toolCalls: [{ toolCallId: 'loop', toolName: 'testTool', args: {} }]
        });

        // Use custom maxLoops option
        const runner = new AgentRunner(mockModel, mockToolsMap, [], true, { maxLoops: 5 });
        // The default MAX_LOOPS is now 10, but we configured 5. So it should call generateText 5 times and then stop.

        const stream = runner.run();
        const reader = stream.getReader();

        while (true) {
            const { done } = await reader.read();
            if (done) break;
        }

        // Loop logic:
        // loopCount = 0; Check < 5? Yes. Run.
        // loopCount = 1; Check < 5? Yes. Run.
        // ...
        // loopCount = 4; Check < 5? Yes. Run.
        // loopCount = 5; Check < 5? No. Stop.
        // Total 5 calls.
        expect(mockGenerateText).toHaveBeenCalledTimes(5);
    });
});
