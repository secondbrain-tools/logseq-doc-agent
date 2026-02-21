import type { Message, MessagePart } from "../../../domain/chat/types";

export function findToolResult(
    message: Message,
    toolCallId: string | undefined,
): MessagePart | undefined {
    if (!toolCallId || !message.parts) return undefined;
    return message.parts.find(
        (p) => p.type === "tool_result" && p.toolCallId === toolCallId,
    );
}

export function getToolSummary(part: MessagePart, result?: any): string {
    const args = part.toolArgs || {};
    const output =
        typeof result?.toolResult === "string"
            ? result.toolResult
            : JSON.stringify(result?.toolResult || "");
    const truncate = (s: string) =>
        s.length > 50 ? s.slice(0, 50) + "…" : s;

    // Helper to extract quoted content from our new return messages
    const extractQuote = (s: string) => {
        const match = s.match(/"([^"]+)"/);
        return match ? match[1] : "";
    };

    switch (part.toolName) {
        case "addBlock":
        case "updateBlock":
            return args.content ? `"${truncate(args.content)}"` : "";

        case "deleteBlock":
            const delContent = extractQuote(output);
            return delContent
                ? `"${truncate(delContent)}"`
                : args.id
                    ? `#${args.id}`
                    : "";

        case "moveBlock":
            const movContent = extractQuote(output);
            return movContent
                ? `"${truncate(movContent)}"`
                : args.id
                    ? `#${args.id}`
                    : "";

        case "getBlock":
            let blockContent = output;
            try {
                const parsed = JSON.parse(output);
                if (parsed.content) blockContent = parsed.content;
            } catch { }
            // If it's just block content string
            if (output && !output.startsWith("{")) blockContent = output;
            return blockContent
                ? `"${truncate(blockContent)}"`
                : args.id
                    ? `#${args.id}`
                    : "";

        case "getLogseqDocument":
            return "current page";

        default:
            return "";
    }
}

// --- Grouping Logic ---

export type ToolSubGroup = {
    toolName: string;
    parts: { part: MessagePart; index: number; result?: MessagePart }[];
    count: number;
    label: string;
};

export type ToolGroup = {
    type: "tool_group";
    subgroups: ToolSubGroup[];
    collapsed: boolean;
    label: string;
};

export type DisplayItem =
    | { type: "part"; part: MessagePart; index: number }
    | ToolGroup;

export function buildDisplayItems(msg: Message): DisplayItem[] {
    if (!msg.parts) return [];
    const items: DisplayItem[] = [];
    let currentGroup: {
        part: MessagePart;
        index: number;
        result?: MessagePart;
    }[] = [];

    for (let i = 0; i < msg.parts.length; i++) {
        const part = msg.parts[i];

        if (part.type === "tool_call") {
            const result = findToolResult(msg, part.toolCallId);
            currentGroup.push({ part, index: i, result });
        } else {
            // Flush group if exists
            if (currentGroup.length > 0) {
                flushGroup(items, currentGroup);
                currentGroup = [];
            }
            if (part.type !== "tool_result") {
                // Hide standalone tool_results (handled in call)
                items.push({ type: "part", part, index: i });
            }
        }
    }
    // Flush remaining
    if (currentGroup.length > 0) {
        flushGroup(items, currentGroup);
    }
    return items;
}

function flushGroup(
    items: DisplayItem[],
    group: { part: MessagePart; index: number; result?: MessagePart }[],
) {
    if (group.length === 1) {
        items.push({
            type: "part",
            part: group[0].part,
            index: group[0].index,
        });
        return;
    }

    // Identify subgroups
    const subgroups: ToolSubGroup[] = [];
    let currentSub: {
        part: MessagePart;
        index: number;
        result?: MessagePart;
    }[] = [];

    for (const item of group) {
        if (currentSub.length === 0) {
            currentSub.push(item);
        } else {
            const prevName = currentSub[0].part.toolName;
            if (item.part.toolName === prevName) {
                currentSub.push(item);
            } else {
                // Flush sub
                subgroups.push({
                    toolName: prevName || "unknown",
                    parts: currentSub,
                    count: currentSub.length,
                    label: `${currentSub.length} × ${prevName}`,
                });
                currentSub = [item];
            }
        }
    }
    // Flush last
    if (currentSub.length > 0) {
        const name = currentSub[0].part.toolName;
        subgroups.push({
            toolName: name || "unknown",
            parts: currentSub,
            count: currentSub.length,
            label: `${currentSub.length} × ${name}`,
        });
    }

    const totalTools = group.length;
    let label = "";

    if (subgroups.length === 1) {
        label = subgroups[0].label;
    } else {
        label = `${totalTools} tools`;
    }

    items.push({
        type: "tool_group",
        subgroups,
        collapsed: true,
        label,
    });
}
