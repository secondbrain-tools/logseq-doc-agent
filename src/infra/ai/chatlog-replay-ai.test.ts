import { describe, expect, it, vi } from "vitest";
import { ChatlogReplayAIService } from "./chatlog-replay-ai";

async function collectStream(stream: ReadableStream<any>): Promise<any[]> {
  const chunks: any[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

describe("ChatlogReplayAIService", () => {
  it("emits reasoning chunks from recorded chatlog", async () => {
    const chatlog = {
      messages: [
        {
          role: "assistant",
          parts: [{ type: "reasoning", text: "Let me think about this." }],
        },
      ],
    };

    const service = new ChatlogReplayAIService(chatlog, {});
    const stream = await service.streamAgent([], "model", "provider");
    const chunks = await collectStream(stream);

    expect(chunks).toEqual([{ type: "reasoning", textDelta: "Let me think about this." }]);
  });

  it("emits content as text-delta", async () => {
    const chatlog = {
      messages: [
        {
          role: "assistant",
          parts: [{ type: "content", text: "Here is the response." }],
        },
      ],
    };

    const service = new ChatlogReplayAIService(chatlog, {});
    const stream = await service.streamAgent([], "model", "provider");
    const chunks = await collectStream(stream);

    expect(chunks).toEqual([{ type: "text-delta", textDelta: "Here is the response." }]);
  });

  it("accepts both tool_call and tool-call part types", async () => {
    const toolExecute = vi.fn().mockResolvedValue("result");

    const chatlog = {
      messages: [
        {
          role: "assistant",
          parts: [
            { type: "tool_call", toolCallId: "1", toolName: "t", toolArgs: {} },
            { type: "tool-call", toolCallId: "2", toolName: "t", toolArgs: {} },
          ],
        },
      ],
    };

    const service = new ChatlogReplayAIService(chatlog, {
      t: { execute: toolExecute },
    });
    const stream = await service.streamAgent([], "model", "provider");
    const chunks = await collectStream(stream);

    expect(chunks).toHaveLength(4);
    expect(chunks[0]).toMatchObject({ type: "tool-call", toolCallId: "1" });
    expect(chunks[1]).toMatchObject({ type: "tool-result", toolCallId: "1" });
    expect(chunks[2]).toMatchObject({ type: "tool-call", toolCallId: "2" });
    expect(chunks[3]).toMatchObject({ type: "tool-result", toolCallId: "2" });
    expect(toolExecute).toHaveBeenCalledTimes(2);
  });

  it("skips recorded tool_result items in favor of freshly generated tool execution", async () => {
    const toolExecute = vi.fn().mockResolvedValue("fresh-result");

    const chatlog = {
      messages: [
        {
          role: "assistant",
          parts: [
            { type: "tool_call", toolCallId: "1", toolName: "t", toolArgs: { x: 1 } },
            { type: "tool_result", toolCallId: "1", toolName: "t", result: "old-recorded" },
          ],
        },
      ],
    };

    const service = new ChatlogReplayAIService(chatlog, {
      t: { execute: toolExecute },
    });
    const stream = await service.streamAgent([], "model", "provider");
    const chunks = await collectStream(stream);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ type: "tool-call", toolCallId: "1" });
    expect(chunks[1]).toMatchObject({
      type: "tool-result",
      toolCallId: "1",
      result: "fresh-result",
    });
    // Ignores the recorded tool_result entirely
  });

  it("throws a useful error when tool is missing from toolsMap", async () => {
    const chatlog = {
      messages: [
        {
          role: "assistant",
          parts: [{ type: "tool_call", toolCallId: "1", toolName: "noSuchTool", toolArgs: {} }],
        },
      ],
    };

    const service = new ChatlogReplayAIService(chatlog, {});
    const stream = await service.streamAgent([], "model", "provider");

    // need to trigger the error by reading the stream
    await expect(collectStream(stream)).rejects.toThrow(/noSuchTool not found in tools map/);
  });

  it("serializes tool args into plain JSON before execution", async () => {
    let capturedArgs: any;
    const toolExecute = vi.fn().mockImplementation((args) => {
      capturedArgs = args;
      return "ok";
    });

    const chatlog = {
      messages: [
        {
          role: "assistant",
          parts: [
            {
              type: "tool_call",
              toolCallId: "1",
              toolName: "t",
              toolArgs: { nested: { deep: true }, list: [1, 2] },
            },
          ],
        },
      ],
    };

    const service = new ChatlogReplayAIService(chatlog, {
      t: { execute: toolExecute },
    });
    const stream = await service.streamAgent([], "model", "provider");
    await collectStream(stream);

    // After JSON.parse(JSON.stringify(...)), capturedArgs should be a plain object
    expect(capturedArgs).toEqual({ nested: { deep: true }, list: [1, 2] });
    expect(JSON.parse(JSON.stringify(capturedArgs))).toEqual(capturedArgs);
  });

  it("throws when no assistant message is in the chatlog", async () => {
    const chatlog = { messages: [{ role: "user", parts: [{ type: "content", text: "hello" }] }] };

    const service = new ChatlogReplayAIService(chatlog, {});

    await expect(service.streamAgent([], "model", "provider")).rejects.toThrow(
      /No assistant message found/,
    );
  });

  it("respects abort signal to skip all parts when aborted before processing", async () => {
    const toolExecute = vi.fn().mockResolvedValue("ok");

    const chatlog = {
      messages: [
        {
          role: "assistant",
          parts: [
            { type: "tool_call", toolCallId: "1", toolName: "t", toolArgs: {} },
            { type: "tool_call", toolCallId: "2", toolName: "t", toolArgs: {} },
          ],
        },
      ],
    };

    const controller = new AbortController();
    controller.abort(); // Abort before any processing

    const service = new ChatlogReplayAIService(chatlog, {
      t: { execute: toolExecute },
    });

    const stream = await service.streamAgent(
      [],
      "model",
      "provider",
      true,
      undefined,
      undefined,
      controller.signal,
    );

    const chunks = await collectStream(stream);
    expect(chunks).toHaveLength(0);
  });
});
