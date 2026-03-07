/**
 * Helper to filter properties based on glob patterns
 * Returns [cleanContent, headerString]
 */
export const LDA_NAMESPACE = 'logseq-doc-agent';
export const LDA_PROMPT_NAME_PROPERTY = 'logseq-doc-agent.prompt';
export const LDA_PROMPT_NAME_PROPERTY_CAMEL = 'logseqDocAgent.prompt';

export const LDA_MERGE_PROPERTY = 'logseq-doc-agent.merge';
export const LDA_MERGE_PROPERTY_CAMEL = 'logseqDocAgent.merge';
export const LDA_EVALUATION_PROPERTY = 'logseq-doc-agent.evaluation';
export const LDA_EVALUATION_PROPERTY_CAMEL = 'logseqDocAgent.evaluation';

export function filterProperties(
    content: string,
    patterns: string[],
): [string, string] {
    if (!content || patterns.length === 0) return [content, ""];

    const lines = content.split("\n");
    const headerLines: string[] = [];
    const bodyLines: string[] = [];

    // Simple regex for property check: many-keys:: value
    const propRegex = /^([^:]+)::\s*(.*)$/;

    // Helper for glob matching
    const matchPattern = (key: string, pattern: string) => {
        const regexString = pattern
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*");
        return new RegExp(`^${regexString}$`).test(key);
    };

    for (const line of lines) {
        const trimmed = line.trim();
        const match = trimmed.match(propRegex);

        if (match) {
            const key = match[1].trim(); // CRITICAL: Trim key to handle indentation
            const isMatch = patterns.some((p) =>
                matchPattern(key, p.trim()),
            );
            if (isMatch) {
                headerLines.push(line);
                continue;
            }
        }
        bodyLines.push(line);
    }

    return [bodyLines.join("\n"), headerLines.join("\n")];
}

/**
 * LDA properties that are stripped from block text content before passing
 * to the AI or rendering as prompt text.  Only operational metadata that
 * has no instructional value should appear here.
 */
export const LDA_PROPERTIES_FILTERED_FROM_CONTENT = [
    LDA_EVALUATION_PROPERTY,
    LDA_MERGE_PROPERTY,
] as const;

/**
 * Logseq internal properties that appear as raw content lines in blocks
 * (Logseq stores them as text but also parses them into `block.properties`).
 * These should be stripped from the agent's view of a document to reduce noise.
 */
export const LOGSEQ_INTERNAL_CONTENT_PROPERTIES = [
    'logseq.order-list-type',
] as const;

/**
 * Strips only the LDA properties listed in LDA_PROPERTIES_FILTERED_FROM_CONTENT
 * from plain-text block content.
 *
 * Lines that are inside fenced code blocks (``` … ```) or that are entirely
 * wrapped in single backticks (inline code) are never removed, regardless of
 * whether they contain a property-like pattern.
 */
export function filterPropertyLinesFromContent(content: string): string {
    if (!content) return '';

    const lines = content.split('\n');
    const result: string[] = [];
    let insideFencedBlock = false;

    for (const line of lines) {
        const trimmed = line.trim();

        // Toggle fenced code block tracking
        if (trimmed.startsWith('```')) {
            insideFencedBlock = !insideFencedBlock;
            result.push(line);
            continue;
        }

        // Never filter lines inside fenced blocks
        if (insideFencedBlock) {
            result.push(line);
            continue;
        }

        // Never filter lines that are entirely inline code (start AND end with backtick)
        if (trimmed.startsWith('`') && trimmed.endsWith('`') && trimmed.length >= 2) {
            result.push(line);
            continue;
        }

        // Strip lines that are a filtered LDA property
        const propMatch = trimmed.match(/^([^:]+)::\s*.+$/);
        if (propMatch) {
            const key = propMatch[1].trim();
            if ((LDA_PROPERTIES_FILTERED_FROM_CONTENT as readonly string[]).includes(key)) {
                continue; // drop this line
            }
        }

        result.push(line);
    }

    return result.join('\n');
}

/**
 * Helper to parse header string back to properties object
 */
export function parseProperties(header: string): Record<string, string> {
    const props: Record<string, string> = {};
    if (!header) return props;

    const lines = header.split('\n');
    const propRegex = /^([^:]+)::\s*(.*)$/;

    for (const line of lines) {
        const stripped = line.trim();
        const match = stripped.match(propRegex);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            props[key] = value;
        }
    }
    return props;
}
