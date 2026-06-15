import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateToolListString, TOOL_LIST_VERSION } from "./tool-list-generator";
import { parseSubtree } from "./subtree-parser";
import { READONLY_TOOLS, WRITE_TOOLS, ALL_TOOL_NAMES } from "./index";

beforeEach(() => {
  (globalThis as any).window = { logseq: { settings: {} } };
});

describe("tool-list-generator", () => {
  function getRootNode(version?: number) {
    const parsed = parseSubtree(generateToolListString(version));
    expect(parsed).toBeDefined();
    return parsed;
  }

  it("should return a string parseable by parseSubtree with title as root content", () => {
    const root = getRootNode();

    expect(root.content).toContain("## Available Tool List");
    expect(root.children.length).toBeGreaterThan(0);
  });

  it("should embed the version property in the title block content", () => {
    const root = getRootNode(42);

    expect(root.content).toContain("logseq-doc-agent.tool-list-version:: 42");
  });

  it('should produce a "readonly tools" and "write tools" category as children of the title block', () => {
    const root = getRootNode();

    const categoryNames = root.children.map((c) => c.content);
    expect(categoryNames).toContain("### readonly tools");
    expect(categoryNames).toContain("### write tools");
  });

  it("should list all readonly tools under the readonly category", () => {
    const root = getRootNode();

    const readonlyCategory = root.children.find((c) => c.content === "### readonly tools");
    expect(readonlyCategory).toBeDefined();

    const toolNames = readonlyCategory!.children.map((c) => c.content);
    for (const name of READONLY_TOOLS) {
      expect(toolNames).toContain(name);
    }
  });

  it("should list all write tools under the write category", () => {
    const root = getRootNode();

    const writeCategory = root.children.find((c) => c.content === "### write tools");
    expect(writeCategory).toBeDefined();

    const toolNames = writeCategory!.children.map((c) => c.content);
    for (const name of WRITE_TOOLS) {
      expect(toolNames).toContain(name);
    }
  });

  it("should include a description child block for each tool", () => {
    const root = getRootNode();

    for (const category of root.children) {
      for (const toolBlock of category.children) {
        expect(toolBlock.children.length).toBe(1);
        expect(toolBlock.children[0].content.length).toBeGreaterThan(0);
      }
    }
  });

  it("should use only the first line of multi-line descriptions", () => {
    const result = generateToolListString();

    expect(result).not.toContain("```");
    const root = getRootNode();
    for (const category of root.children) {
      for (const toolBlock of category.children) {
        const desc = toolBlock.children[0];
        expect(desc.children).toHaveLength(0);
      }
    }
  });

  it("should cover every tool from ALL_TOOL_NAMES", () => {
    const root = getRootNode();

    const allToolNames = root.children.flatMap((c) => c.children.map((t) => t.content));
    for (const name of ALL_TOOL_NAMES) {
      expect(allToolNames).toContain(name);
    }
  });

  it("should use default TOOL_LIST_VERSION when no argument given", () => {
    const result = generateToolListString();
    expect(result).toContain(`logseq-doc-agent.tool-list-version:: ${TOOL_LIST_VERSION}`);
  });
});
