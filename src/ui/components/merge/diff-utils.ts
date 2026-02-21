import * as Diff from "diff";

// Thresholds for intra-line highlighting
export const SIMILARITY_THRESHOLD = 0.4;
export const MIN_LINE_LENGTH = 10;
export const CHANGE_RATIO_THRESHOLD = 0.5; // From previous code if needed, though constant wasn't used in snippet?
export const MAX_LENGTH_THRESHOLD = 300;

export type IntraLinePart = {
    type: "common" | "added" | "removed";
    text: string;
};

export type UnifiedPart = {
    type: "common" | "added" | "removed" | "replacement";
    text?: string;
    removedText?: string;
    addedText?: string;
    // Unique ID for tracking decisions (lineIndex-partIndex)
    id?: string;
};

export type DiffLine = {
    content: string;
    type:
    | "common"
    | "added"
    | "removed"
    | "modified-old"
    | "modified-new"
    | "modified-unified";
    originalLineNumber?: number;
    newLineNumber?: number;
    intraLineParts?: IntraLinePart[];
    unifiedParts?: UnifiedPart[];
    lineIndex?: number;
    isPureAdded?: boolean;
    isPureRemoved?: boolean;
    id?: string; // Unique ID for this line's decision
    blockId?: string; // Shared ID for all lines in a replacement block (for block-level toggle)
    blockRole?: "new" | "old"; // Which side of the block this line belongs to
};

export type PartDecisions = Record<string, "accept" | "revert">;

// Helper to generate part ID
export function getPartId(lineIndex: number, partIndex: number): string {
    return `${lineIndex}-${partIndex}`;
}

export function getLineId(lineIndex: number): string {
    return `line-${lineIndex}`;
}

// Levenshtein distance for similarity calculation
export function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1,
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

export function similarity(a: string, b: string): number {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - (levenshteinDistance(a, b) / maxLen);
}

// Compute intra-line diff parts
export function computeIntraLineParts(
    oldLine: string,
    newLine: string,
): { oldParts: IntraLinePart[]; newParts: IntraLinePart[] } {
    const wordDiff = Diff.diffWordsWithSpace(oldLine, newLine);
    const oldParts: IntraLinePart[] = [];
    const newParts: IntraLinePart[] = [];

    for (const part of wordDiff) {
        if (part.added) {
            newParts.push({ text: part.value, type: "added" });
        } else if (part.removed) {
            oldParts.push({ text: part.value, type: "removed" });
        } else {
            oldParts.push({ text: part.value, type: "common" });
            newParts.push({ text: part.value, type: "common" });
        }
    }

    return { oldParts, newParts };
}

// Check if intra-line highlighting is worth showing
export function shouldShowIntraLine(
    oldLine: string,
    newLine: string,
    parts: { oldParts: IntraLinePart[]; newParts: IntraLinePart[] },
): boolean {
    const maxLen = Math.max(oldLine.length, newLine.length);

    // Skip if line is too long
    if (maxLen > MAX_LENGTH_THRESHOLD) return false;

    // Calculate change ratio
    let changedChars = 0;
    for (const part of parts.oldParts) {
        if (part.type === "removed") changedChars += part.text.length;
    }
    for (const part of parts.newParts) {
        if (part.type === "added") changedChars += part.text.length;
    }

    const changeRatio = changedChars / (2 * maxLen); // Normalize by both lines
    // Using a default of 0.5 since we didn't export it before
    return changeRatio <= 0.5;
}

export function computeUnifiedParts(
    wordDiff: Diff.Change[],
    lineIndex: number,
): UnifiedPart[] {
    const parts: UnifiedPart[] = [];
    let i = 0;
    let pIndex = 0;
    while (i < wordDiff.length) {
        const current = wordDiff[i];

        // Check for replacement (removed followed immediately by added)
        if (
            current.removed &&
            i + 1 < wordDiff.length &&
            wordDiff[i + 1].added
        ) {
            const next = wordDiff[i + 1];
            parts.push({
                type: "replacement",
                removedText: current.value,
                addedText: next.value,
                id: getPartId(lineIndex, pIndex++),
            });
            i += 2;
            continue;
        }

        if (current.added) {
            parts.push({
                type: "added",
                text: current.value,
                id: getPartId(lineIndex, pIndex++),
            });
        } else if (current.removed) {
            parts.push({
                type: "removed",
                text: current.value,
                id: getPartId(lineIndex, pIndex++),
            });
        } else {
            parts.push({
                type: "common",
                text: current.value,
                id: getPartId(lineIndex, pIndex++),
            });
        }
        i++;
    }
    return parts;
}

export function calculateDiffLines(
    originalContent: string,
    modifiedContent: string,
    mode: "lines" | "words",
    initialDecisions: PartDecisions // In-out parameter-like, or we return new decisions
): { diffLines: DiffLine[]; newDecisions: PartDecisions } {
    if (!originalContent && !modifiedContent) return { diffLines: [], newDecisions: initialDecisions };

    const oldText = originalContent || "";
    const newText = modifiedContent || "";

    const changes = Diff.diffLines(oldText, newText, {
        newlineIsToken: false,
    });

    // Step A: Collect raw line changes
    type RawLine = {
        content: string;
        type: "common" | "added" | "removed";
    };
    const rawLines: RawLine[] = [];

    changes.forEach((part) => {
        const partLines = part.value.split("\n");
        if (
            partLines.length > 0 &&
            partLines[partLines.length - 1] === ""
        ) {
            partLines.pop();
        }

        const type: RawLine["type"] = part.added
            ? "added"
            : part.removed
                ? "removed"
                : "common";
        partLines.forEach((line) => {
            rawLines.push({ content: line, type });
        });
    });

    // Step B: Detect replacement blocks and pair lines
    let lines: DiffLine[] = [];
    let oldCounter = 1;
    let newCounter = 1;
    let i = 0;
    const newDecisions = { ...initialDecisions };

    while (i < rawLines.length) {
        const current = rawLines[i];

        if (current.type === "common") {
            lines.push({
                content: current.content,
                type: "common",
                originalLineNumber: oldCounter++,
                newLineNumber: newCounter++,
            });
            i++;
        } else if (current.type === "removed") {
            // Collect consecutive removed lines
            const removedLines: string[] = [];
            let j = i;
            while (j < rawLines.length && rawLines[j].type === "removed") {
                removedLines.push(rawLines[j].content);
                j++;
            }

            // Collect consecutive added lines that follow
            const addedStart = j;
            const addedLines: string[] = [];
            while (j < rawLines.length && rawLines[j].type === "added") {
                addedLines.push(rawLines[j].content);
                j++;
            }

            // If we have both removed and added, it's a replacement block
            if (removedLines.length > 0 && addedLines.length > 0) {
                const baseBlockId = `block-${i}`;
                let currentBlockId = baseBlockId;
                let blockLineCounter = 0;

                // Pair lines by index and similarity
                const maxPairs = Math.min(
                    removedLines.length,
                    addedLines.length,
                );

                for (let k = 0; k < maxPairs; k++) {
                    // Update blockId for this pair (so each pair is distinct toggle)
                    // But keep using the LAST pair's ID for the tail loops below
                    currentBlockId = `${baseBlockId}-p${k}`;

                    const oldLine = removedLines[k];
                    const newLine = addedLines[k];
                    const sim = similarity(oldLine, newLine);

                    if (sim >= SIMILARITY_THRESHOLD && mode === "words") {
                        // Treat as modified - compute intra-line diff
                        const parts = computeIntraLineParts(
                            oldLine,
                            newLine,
                        );
                        const showIntraLine = shouldShowIntraLine(
                            oldLine,
                            newLine,
                            parts,
                        );

                        if (mode === "words") {
                            // Unified Word Mode
                            const wordDiff = Diff.diffWordsWithSpace(
                                oldLine,
                                newLine,
                            );
                            const unifiedParts = computeUnifiedParts(
                                wordDiff,
                                oldCounter,
                            );

                            for (const part of unifiedParts) {
                                if (
                                    part.id &&
                                    part.type !== "common" &&
                                    !newDecisions[part.id]
                                ) {
                                    newDecisions[part.id] = "accept";
                                }
                            }

                            lines.push({
                                content: newLine,
                                type: "modified-unified",
                                originalLineNumber: oldCounter++,
                                newLineNumber: newCounter++,
                                unifiedParts: unifiedParts,
                                lineIndex: i,
                                blockId: currentBlockId,
                            });
                        } else if (showIntraLine) {
                            lines.push({
                                content: oldLine,
                                type: "modified-old",
                                originalLineNumber: oldCounter++,
                                intraLineParts: parts.oldParts,
                            });
                            lines.push({
                                content: newLine,
                                type: "modified-new",
                                newLineNumber: newCounter++,
                                intraLineParts: parts.newParts,
                            });
                        } else {
                            // Change too significant — individual IDs, shared blockId
                            const oldId = `${currentBlockId}-r${blockLineCounter++}`;
                            const newId = `${currentBlockId}-a${blockLineCounter++}`;
                            lines.push({
                                content: oldLine,
                                type: "removed",
                                originalLineNumber: oldCounter++,
                                id: oldId,
                                blockId: currentBlockId,
                                blockRole: "old",
                            });
                            lines.push({
                                content: newLine,
                                type: "added",
                                newLineNumber: newCounter++,
                                id: newId,
                                blockId: currentBlockId,
                                blockRole: "new",
                            });
                            if (!newDecisions[oldId]) newDecisions[oldId] = "accept";
                            if (!newDecisions[newId]) newDecisions[newId] = "accept";
                        }
                    } else {
                        // Low similarity — individual IDs, shared blockId
                        const oldId = `${currentBlockId}-r${blockLineCounter++}`;
                        const newId = `${currentBlockId}-a${blockLineCounter++}`;
                        lines.push({
                            content: oldLine,
                            type: "removed",
                            originalLineNumber: oldCounter++,
                            id: oldId,
                            blockId: currentBlockId,
                            blockRole: "old",
                        });
                        lines.push({
                            content: newLine,
                            type: "added",
                            newLineNumber: newCounter++,
                            id: newId,
                            blockId: currentBlockId,
                            blockRole: "new",
                        });
                        if (!newDecisions[oldId]) newDecisions[oldId] = "accept";
                        if (!newDecisions[newId]) newDecisions[newId] = "accept";
                    }
                }

                // Handle remaining unpaired removed lines — share blockId with last pair (or base if none)
                for (let k = maxPairs; k < removedLines.length; k++) {
                    const lineId = `${currentBlockId}-r${blockLineCounter++}`;
                    lines.push({
                        content: removedLines[k],
                        type: "removed",
                        originalLineNumber: oldCounter++,
                        id: lineId,
                        blockId: currentBlockId,
                        blockRole: "old",
                        isPureRemoved: true,
                    });
                    if (!newDecisions[lineId]) newDecisions[lineId] = "accept";
                }

                // Handle remaining unpaired added lines — share blockId with last pair (or base if none)
                for (let k = maxPairs; k < addedLines.length; k++) {
                    const lineId = `${currentBlockId}-a${blockLineCounter++}`;
                    lines.push({
                        content: addedLines[k],
                        type: "added",
                        newLineNumber: newCounter++,
                        id: lineId,
                        blockId: currentBlockId,
                        blockRole: "new",
                        isPureAdded: true,
                    });
                    if (!newDecisions[lineId]) newDecisions[lineId] = "accept";
                }
            } else {
                // Pure removed lines (no following added)
                let relIndex = 0;
                for (const line of removedLines) {
                    const lineId = getLineId(i + relIndex);
                    lines.push({
                        content: line,
                        type: "removed",
                        originalLineNumber: oldCounter++,
                        id: lineId,
                        isPureRemoved: true,
                    });
                    if (!newDecisions[lineId]) newDecisions[lineId] = "accept";
                    relIndex++;
                }
                // Pure added lines (no preceding removed)
                relIndex = 0;
                for (const line of addedLines) {
                    const lineId = getLineId(addedStart + relIndex);
                    lines.push({
                        content: line,
                        type: "added",
                        newLineNumber: newCounter++,
                        id: lineId,
                        isPureAdded: true,
                    });
                    if (!newDecisions[lineId]) newDecisions[lineId] = "accept";
                    relIndex++;
                }
            }

            i = j;
        } else if (current.type === "added") {
            // Pure added line (not part of a replacement block)
            lines.push({
                content: current.content,
                type: "added",
                newLineNumber: newCounter++,
                lineIndex: i,
                isPureAdded: true,
                id: getLineId(i),
            });
            const addedId = getLineId(i);
            if (!newDecisions[addedId]) newDecisions[addedId] = "accept";
            i++;
        }
    }

    return { diffLines: lines, newDecisions };
}

export function generateContentFromDiff(diffLines: DiffLine[], decisions: PartDecisions): string {
    let content = "";
    for (const line of diffLines) {
        if (line.type === "common") {
            content += line.content + "\n";
        } else if (line.type === "modified-unified" && line.unifiedParts) {
            // Reconstruct line based on parts decisions
            let lineText = "";
            for (const part of line.unifiedParts) {
                if (!part.id) {
                    lineText += part.text || "";
                    continue;
                }
                const decision = decisions[part.id] || "accept";

                if (part.type === "common") {
                    lineText += part.text || "";
                } else if (part.type === "added") {
                    // If accepted, keep text. If reverted, drop it.
                    if (decision === "accept") lineText += part.text || "";
                } else if (part.type === "removed") {
                    // If accepted (removal confirmed), drop text.
                    // If reverted (removal rejected), restore text.
                    if (decision === "revert") lineText += part.text || "";
                } else if (part.type === "replacement") {
                    // If accepted, use addedText. If reverted, use removedText.
                    if (decision === "accept")
                        lineText += part.addedText || "";
                    else lineText += part.removedText || "";
                }
            }
            content += lineText + "\n";
        } else if (line.blockRole && line.id) {
            // Line in a replacement block: each line has its own decision
            const decision = decisions[line.id] || "accept";
            if (line.blockRole === "new") {
                // New line: include if accepted
                if (decision === "accept") content += line.content + "\n";
            } else {
                // Old line: include if reverted
                if (decision === "revert") content += line.content + "\n";
            }
        } else if (line.isPureAdded) {
            // Unpaired added line
            const id = line.id || getLineId(line.lineIndex !== undefined ? line.lineIndex : 0);
            const decision = decisions[id] || "accept";
            if (decision === "accept") {
                content += line.content + "\n";
            }
        } else if (line.isPureRemoved) {
            // Unpaired removed line
            const id = line.id || getLineId(line.lineIndex !== undefined ? line.lineIndex : 0);
            const decision = decisions[id] || "accept";
            if (decision === "revert") {
                content += line.content + "\n";
            }
        } else if (line.type === "modified-old") {
            // Legacy split/intra-line - ignore for unified gen
        } else if (line.type === "modified-new") {
            // ...
        }
    }
    // Remove last newline - WAIT, if we remove it, we cause loops if input had it.
    // Let's NOT remove it? 
    // diffLines usually generates content + \n. 
    // If we have 1 line "A". We gen "A\n".
    // If input was "A", we want "A".
    // If input was "A\n", we want "A\n".

    // Changing this logic might affect other things.
    // But `InlineDiff` now handles the loop by ignoring trailing newline diffs.
    // So this change is optional but good for correctness if we can detect intent.

    // For now, let's keep it as is since InlineDiff handles it, to avoid breaking other tests.
    if (content.endsWith("\n")) content = content.slice(0, -1);
    return content;
}
