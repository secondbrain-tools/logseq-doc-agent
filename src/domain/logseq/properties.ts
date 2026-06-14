import type { MergeEntity } from "../merge/entity";

/**
 * Helper to filter properties based on glob patterns
 * Returns [cleanContent, headerString]
 */
export const LDA_NAMESPACE = "logseq-doc-agent";
export const LDA_PROMPT_NAME_PROPERTY = "logseq-doc-agent.prompt";
export const LDA_PROMPT_NAME_PROPERTY_CAMEL = "logseqDocAgent.prompt";

export const LDA_MERGE_PROPERTY = "logseq-doc-agent.merge";
export const LDA_MERGE_PROPERTY_CAMEL = "logseqDocAgent.merge";
export const LDA_EVALUATION_PROPERTY = "logseq-doc-agent.evaluation";
export const LDA_EVALUATION_PROPERTY_CAMEL = "logseqDocAgent.evaluation";

/**
 * Regular expression to match any valid Logseq property line.
 * A logseq property key cannot contain spaces or colons.
 * Group 1 is the key, Group 2 is the value.
 */
export const LOGSEQ_PROPERTY_REGEX = /^\s*([^\s:]+)::\s*(.*)$/;

/**
 * Regular expression to check if a line starts with a property key.
 */
export const LOGSEQ_PROPERTY_START_REGEX = /^\s*[^\s:]+::/;

export function filterProperties(content: string, patterns: string[]): [string, string] {
  if (!content || patterns.length === 0) return [content, ""];

  const lines = content.split("\n");
  const headerLines: string[] = [];
  const bodyLines: string[] = [];

  const propRegex = LOGSEQ_PROPERTY_REGEX;

  const matchPattern = (key: string, pattern: string) => {
    const regexString = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${regexString}$`).test(key);
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(propRegex);

    if (match) {
      const key = match[1].trim();
      const isMatch = patterns.some((p) => matchPattern(key, p.trim()));
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
 * to the AI or rendering as prompt text. Only operational metadata that
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
export const LOGSEQ_INTERNAL_CONTENT_PROPERTIES = ["logseq.order-list-type"] as const;

/**
 * Strips only the LDA properties listed in LDA_PROPERTIES_FILTERED_FROM_CONTENT
 * from plain-text block content.
 *
 * Lines that are inside fenced code blocks (``` … ```) or that are entirely
 * wrapped in single backticks (inline code) are never removed, regardless of
 * whether they contain a property-like pattern.
 */
export function filterPropertyLinesFromContent(content: string): string {
  if (!content) return "";

  const lines = content.split("\n");
  const result: string[] = [];
  let insideFencedBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      insideFencedBlock = !insideFencedBlock;
      result.push(line);
      continue;
    }

    if (insideFencedBlock) {
      result.push(line);
      continue;
    }

    if (trimmed.startsWith("`") && trimmed.endsWith("`") && trimmed.length >= 2) {
      result.push(line);
      continue;
    }

    const propMatch = trimmed.match(LOGSEQ_PROPERTY_REGEX);
    if (propMatch) {
      const key = propMatch[1].trim();
      if ((LDA_PROPERTIES_FILTERED_FROM_CONTENT as readonly string[]).includes(key)) {
        continue;
      }
    }

    result.push(line);
  }

  return result.join("\n");
}

/**
 * Helper to parse header string back to properties object
 */
export function parseProperties(header: string): Record<string, string> {
  const props: Record<string, string> = {};
  if (!header) return props;

  const lines = header.split("\n");
  const propRegex = LOGSEQ_PROPERTY_REGEX;

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

export function extractExistingMergeData(content: string): MergeEntity | null {
  const match = content.match(new RegExp(`${LDA_MERGE_PROPERTY}::\\s*(.+)`));
  if (match && match[1]) {
    try {
      return JSON.parse(match[1]);
    } catch (e) {}
  }
  return null;
}

export function splitContentAttributes(content: string) {
  const lines = content.split("\n");
  const properties: string[] = [];
  const body: string[] = [];
  let inProps = true;

  const propRegex = LOGSEQ_PROPERTY_START_REGEX;

  for (const line of lines) {
    if (inProps) {
      if (propRegex.test(line)) {
        if (!line.startsWith(`${LDA_MERGE_PROPERTY}::`)) {
          properties.push(line);
        }
      } else {
        inProps = false;
        body.push(line);
      }
    } else {
      body.push(line);
    }
  }

  return {
    body: body.join("\n"),
    properties: properties.join("\n"),
  };
}
