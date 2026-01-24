
// @ts-ignore
import { streamText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

// Mock OpenAI
const openai = createOpenAI({
    apiKey: 'test',
});

const messages = [
    {
        "role": "system",
        "content": "You are a helpful assistant."
    },
    {
        "role": "assistant",
        "content": [{ "type": "text", "text": "Hello! I'm your AI assistant." }]
    },
    {
        "role": "user",
        "content": [{ "type": "text", "text": "please summarize the document" }]
    },
    {
        "role": "assistant",
        "content": [{ "type": "tool-call", "toolCallId": "call_265CVwAqb06lUxHVJrc94fvw", "toolName": "getLogseqDocument", "input": {} }]
    },
    {
        "role": "tool",
        "content": [{ "type": "tool-result", "toolCallId": "call_265CVwAqb06lUxHVJrc94fvw", "toolName": "getLogseqDocument", "output": { "type": "text", "value": "Selection Type: page\nPage: Testo" } }]
    }
];

async function run() {
    try {
        console.log('Testing streamText validation...');
        const result = streamText({
            model: openai('gpt-4o'),
            messages: messages as any[],
            maxSteps: 1
        });

        console.log('Stream verified.');
        for await (const chunk of result.fullStream) {
            // Consume
        }
        console.log('Stream consumed.');
    } catch (e) {
        console.error('Validation Error:', e);
    }
}

run();
