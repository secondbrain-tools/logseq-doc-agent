import { marked } from "marked";

marked.use({ breaks: true });

type MarkedToken = {
  type: string;
  raw?: string;
  text?: string;
  depth?: number;
  tokens?: MarkedToken[];
};

export interface ResponseSection {
  key: string;
  level: number;
  headingText: string;
  headingHtml: string;
  bodyMarkdown: string;
  bodyHtml: string;
  isCollapsible: boolean;
  ordinal: number;
  index: number;
  children: ResponseSection[];
}

type SectionNode = {
  key: string;
  level: number;
  headingText: string;
  headingHtml: string;
  bodyTokens: MarkedToken[];
  children: SectionNode[];
  ordinal: number;
  index: number;
  titleCounts: Map<string, number>;
};

export function normalizeListIndent(text: string): string {
  return text.replace(/\t/g, "  ");
}

export function renderMarkdownHtml(text: string): string {
  try {
    return marked.parse(normalizeListIndent(text)) as string;
  } catch (error) {
    console.warn("Markdown parse error", error);
    return text;
  }
}

export function renderInlineMarkdownHtml(text: string): string {
  try {
    return marked.parseInline(normalizeListIndent(text)) as string;
  } catch (error) {
    console.warn("Markdown inline parse error", error);
    return text;
  }
}

function renderTokensHtml(tokens: MarkedToken[]): string {
  if (tokens.length === 0) return "";

  try {
    return marked.parser(tokens as any) as string;
  } catch (error) {
    console.warn("Markdown token parse error", error);
    return renderMarkdownHtml(tokens.map((token) => token.raw ?? "").join(""));
  }
}

function tokensToMarkdown(tokens: MarkedToken[]): string {
  return tokens.map((token) => token.raw ?? "").join("");
}

function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

  return slug || "untitled";
}

function createIntroNode(): SectionNode {
  return {
    key: "intro",
    level: 0,
    headingText: "",
    headingHtml: "",
    bodyTokens: [],
    children: [],
    ordinal: 1,
    index: 0,
    titleCounts: new Map(),
  };
}

function createHeadingNode(parent: SectionNode, level: number, headingText: string): SectionNode {
  const index = parent.children.length;
  const titleKey = `${level}:${slugifyHeading(headingText)}`;
  const ordinal = (parent.titleCounts.get(titleKey) ?? 0) + 1;
  parent.titleCounts.set(titleKey, ordinal);

  return {
    key: `${parent.key}.${level}.${index}.${ordinal}.${slugifyHeading(headingText)}`,
    level,
    headingText,
    headingHtml: renderInlineMarkdownHtml(headingText),
    bodyTokens: [],
    children: [],
    ordinal,
    index,
    titleCounts: new Map(),
  };
}

function isHeadingToken(
  token: MarkedToken,
): token is MarkedToken & { type: "heading"; depth: number } {
  return token.type === "heading" && typeof token.depth === "number";
}

function finalizeNode(node: SectionNode): ResponseSection {
  const children = node.children.map(finalizeNode);
  const bodyMarkdown = tokensToMarkdown(node.bodyTokens).trimEnd();
  const bodyHtml = renderTokensHtml(node.bodyTokens);
  const hasContent = bodyMarkdown.trim().length > 0 || children.length > 0;

  return {
    key: node.key,
    level: node.level,
    headingText: node.headingText,
    headingHtml: node.headingHtml,
    bodyMarkdown,
    bodyHtml,
    isCollapsible: node.level > 0 && hasContent,
    ordinal: node.ordinal,
    index: node.index,
    children,
  };
}

export function buildResponseSections(text: string): ResponseSection[] {
  const tokens = marked.lexer(normalizeListIndent(text)) as MarkedToken[];
  const root = createIntroNode();
  const stack: SectionNode[] = [root];

  for (const token of tokens) {
    if (isHeadingToken(token)) {
      while (stack.length > 1 && stack[stack.length - 1].level >= token.depth) {
        stack.pop();
      }

      const parent = stack[stack.length - 1];
      const node = createHeadingNode(parent, token.depth, token.text ?? "");
      parent.children.push(node);
      stack.push(node);
      continue;
    }

    stack[stack.length - 1].bodyTokens.push(token);
  }

  return [finalizeNode(root)];
}
