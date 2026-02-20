import { describe, it, expect } from "vitest";
import { buildDisplayItems, getToolSummary, findToolResult } from "./message-bubble.utils";
import type { Message, MessagePart } from "../../../domain/chat/types";

describe("Message Bubble Utils", () => {
    describe("findToolResult", () => {
        it("should return the correct tool result part", () => {
            const msg: Message = {
                id: "test-id",
                content: "",
                role: "assistant",
                parts: [
                    { type: "tool_call", toolCallId: "1", toolName: "getBlock", toolArgs: { id: "123" } },
                    { type: "tool_result", toolCallId: "1", toolResult: "success" },
                ]
            };
            const result = findToolResult(msg, "1");
            expect(result).toBeDefined();
            expect(result?.toolResult).toBe("success");
        });

        it("should return undefined if toolCallId is not found", () => {
            const msg: Message = {
                id: "test-id",
                content: "",
                role: "assistant",
                parts: [
                    { type: "tool_call", toolCallId: "1", toolName: "getBlock", toolArgs: { id: "123" } },
                ]
            };
            const result = findToolResult(msg, "1");
            expect(result).toBeUndefined();
        });
    });

    describe("getToolSummary", () => {
        it("should return summary for addBlock", () => {
            const part: MessagePart = { type: "tool_call", toolCallId: "1", toolName: "addBlock", toolArgs: { content: "hello world" } };
            expect(getToolSummary(part)).toBe('"hello world"');
        });

        it("should return summary for deleteBlock with result", () => {
            const part: MessagePart = { type: "tool_call", toolCallId: "1", toolName: "deleteBlock", toolArgs: { id: "123" } };
            const result: MessagePart = { type: "tool_result", toolCallId: "1", toolResult: '"deleted block content"' };
            expect(getToolSummary(part, result)).toBe('"deleted block content"');
        });

        it("should fallback to id if deleteBlock result has no quote", () => {
            const part: MessagePart = { type: "tool_call", toolCallId: "1", toolName: "deleteBlock", toolArgs: { id: "123" } };
            const result: MessagePart = { type: "tool_result", toolCallId: "1", toolResult: "success" };
            expect(getToolSummary(part, result)).toBe('#123');
        });

        it("should truncate long strings", () => {
            const longString = "A".repeat(60);
            const part: MessagePart = { type: "tool_call", toolCallId: "1", toolName: "addBlock", toolArgs: { content: longString } };
            expect(getToolSummary(part)).toBe(`"${"A".repeat(50)}…"`);
        });
    });

    describe("buildDisplayItems", () => {
        it("should group multiple consecutive tool calls of same type", () => {
            const msg: Message = {
                id: "test-id",
                content: "",
                role: "assistant",
                parts: [
                    { type: "tool_call", toolCallId: "1", toolName: "getBlock", toolArgs: { id: "1" } },
                    { type: "tool_call", toolCallId: "2", toolName: "getBlock", toolArgs: { id: "2" } },
                    { type: "tool_result", toolCallId: "1", toolResult: "success" },
                    { type: "tool_result", toolCallId: "2", toolResult: "success" },
                ]
            };
            const items = buildDisplayItems(msg);
            expect(items.length).toBe(1);
            expect(items[0].type).toBe("tool_group");
            if (items[0].type === "tool_group") {
                expect(items[0].subgroups.length).toBe(1);
                expect(items[0].subgroups[0].parts.length).toBe(2);
                expect(items[0].subgroups[0].label).toBe("2 × getBlock");
                expect(items[0].label).toBe("2 × getBlock");
            }
        });

        it("should interleave standalone tool calls if not consecutive", () => {
            const msg: Message = {
                id: "test-id",
                content: "",
                role: "assistant",
                parts: [
                    { type: "tool_call", toolCallId: "1", toolName: "getBlock", toolArgs: { id: "1" } },
                    { type: "content", text: "hello" },
                    { type: "tool_call", toolCallId: "2", toolName: "getBlock", toolArgs: { id: "2" } },
                ]
            };
            const items = buildDisplayItems(msg);
            expect(items.length).toBe(3);
            expect(items[0].type).toBe("part");
            expect(items[1].type).toBe("part");
            expect(items[2].type).toBe("part");
        });

        it("should hide standalone tool results", () => {
            const msg: Message = {
                id: "test-id",
                content: "",
                role: "assistant",
                parts: [
                    { type: "tool_call", toolCallId: "1", toolName: "getBlock", toolArgs: { id: "1" } },
                    { type: "tool_result", toolCallId: "1", toolResult: "success" },
                ]
            };
            const items = buildDisplayItems(msg);
            // One item because the single tool call is emitted as a "part" and tool_result is excluded
            expect(items.length).toBe(1);
            expect(items[0].type).toBe("part");
            if (items[0].type === "part") {
                expect(items[0].part.type).toBe("tool_call");
            }
        });
    });
});
