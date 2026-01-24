
import { describe, it, expect } from 'vitest';
import { mapMessages } from './message-mapper';
import type { Message } from '../../domain/chat/types';
// @ts-ignore
import { streamText } from 'ai';
// @ts-ignore
import { createOpenAI } from '@ai-sdk/openai';

describe('mapMessages', () => {
    it('should map user messages correctly', () => {
        const input: Message[] = [{
            id: '1',
            role: 'user',
            content: 'Hello world',
            parts: []
        }];

        const output = mapMessages(input);
        expect(output).toEqual([{
            role: 'user',
            content: [{ type: 'text', text: 'Hello world' }]
        }]);
    });

    it('should map system messages to string content', () => {
        const input: Message[] = [{
            id: 'sys',
            role: 'system',
            content: 'System instruction',
            parts: []
        }];

        const output = mapMessages(input);
        expect(output).toEqual([{
            role: 'system',
            content: 'System instruction'
        }]);
    });

    it('should map assistant messages with tool calls using input property', () => {
        const input: Message[] = [{
            id: 'ai1',
            role: 'assistant',
            content: '',
            parts: [{
                type: 'tool_call',
                toolCallId: 'call_123',
                toolName: 'testTool',
                toolArgs: { arg1: 'value1' }
            }]
        }];

        const output = mapMessages(input);
        expect(output).toHaveLength(1);
        const msg = output[0] as any;
        expect(msg.role).toBe('assistant');
        expect(msg.content[0].type).toBe('tool-call');
        expect(msg.content[0].input).toEqual({ arg1: 'value1' }); // Check input property
        expect(msg.content[0].args).toBeUndefined(); // Should NOT have args
    });

    it('should map tool result messages using output property', () => {
        const input: Message[] = [{
            id: 'tool1',
            role: 'tool',
            content: '',
            parts: [{
                type: 'tool_result',
                toolCallId: 'call_123',
                toolName: 'testTool',
                toolResult: 'Success'
            }]
        }];

        const output = mapMessages(input);
        expect(output).toHaveLength(1);
        const msg = output[0] as any;
        expect(msg.role).toBe('tool');
        expect(msg.content[0].type).toBe('tool-result');
        expect(msg.content[0].output).toEqual({
            type: 'text',
            value: 'Success' // String result remains string
        });
        expect(msg.content[0].result).toBeUndefined(); // Should NOT have result property directly
    });

    it('should inject placeholder assistant message for Tool -> User transition', () => {
        const input: Message[] = [
            {
                id: 'tool1',
                role: 'tool',
                content: '',
                parts: [{
                    type: 'tool_result',
                    toolCallId: 'call_123',
                    toolName: 'testTool',
                    toolResult: 'Done'
                }]
            },
            {
                id: 'user2',
                role: 'user',
                content: 'Next query',
                parts: []
            }
        ];

        const output = mapMessages(input);
        expect(output).toHaveLength(3); // Tool, Assistant Placeholder, User
        expect(output[0].role).toBe('tool');
        expect(output[1].role).toBe('assistant');
        expect((output[1].content as any)[0].text).toContain('Tool execution completed');
        expect(output[2].role).toBe('user');
    });

    // Integration check with SDK validation logic
    it('should produce messages accepted by streamText validation', async () => {
        // Construct a complex history
        const input: Message[] = [
            { id: '1', role: 'system', content: 'Act helpful', parts: [] },
            { id: '2', role: 'user', content: 'Hi', parts: [] },
            {
                id: '3',
                role: 'assistant',
                content: '',
                parts: [{ type: 'tool_call', toolCallId: 'c1', toolName: 't1', toolArgs: { x: 1 } }]
            },
            {
                id: '4',
                role: 'tool',
                content: '',
                parts: [{ type: 'tool_result', toolCallId: 'c1', toolName: 't1', toolResult: 'OK' }]
            }
        ];

        const coreMessages = mapMessages(input);

        // Mock OpenAI provider
        const openai = createOpenAI({ apiKey: 'test' });

        // We expect this to throw APICallError (401) but NOT TypeValidationError
        try {
            const result = streamText({
                model: openai('gpt-4o'),
                messages: coreMessages as any[],
                maxSteps: 1
            });
            for await (const _chunk of result.fullStream) { }
        } catch (e: any) {
            // It should fail on API key, not validation
            if (e.name === 'AI_TypeValidationError') {
                throw e; // Fail test if validation fails
            }
            // Ignore other errors (APICallError)
        }
    });

});
