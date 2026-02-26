/**
 * Helper to filter properties based on glob patterns
 * Returns [cleanContent, headerString]
 */
export const LDA_NAMESPACE = 'logseq-doc-agent';
export const LDA_PROMPT_NAME_PROPERTY = 'logseq-doc-agent.prompt.name';
export const LDA_PROMPT_NAME_PROPERTY_CAMEL = 'logseqDocAgent.prompt.name';

export const LDA_MERGE_PROPERTY = 'logseq-doc-agent.merge';
export const LDA_MERGE_PROPERTY_CAMEL = 'logseqDocAgent.merge';
export const LDA_EVALUATION_PROPERTY = 'logseq-doc-agent.evaluation';

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
