import { describe, expect, it } from "vitest";
import { buildResponseSections } from "./message-bubble.sections";

function findSectionByHeading(sections: ReturnType<typeof buildResponseSections>, heading: string) {
  const walk = (nodes: ReturnType<typeof buildResponseSections>): any => {
    for (const node of nodes) {
      if (node.headingText === heading) return node;
      const found: any = walk(node.children as ReturnType<typeof buildResponseSections>);
      if (found) return found;
    }
    return undefined;
  };

  return walk(sections);
}

describe("message-bubble.sections", () => {
  it("builds hierarchical sections with repeated headings", () => {
    const sections = buildResponseSections(`
Intro paragraph.

# Alpha
Alpha body.

## Beta
Beta body.

### Gamma
Gamma body.

# Alpha
Second alpha body.
`);

    expect(sections).toHaveLength(1);
    const root = sections[0];
    expect(root.level).toBe(0);
    expect(root.bodyMarkdown).toContain("Intro paragraph.");
    expect(root.children).toHaveLength(2);

    const firstAlpha = root.children[0];
    const secondAlpha = root.children[1];
    expect(firstAlpha.headingText).toBe("Alpha");
    expect(firstAlpha.ordinal).toBe(1);
    expect(secondAlpha.ordinal).toBe(2);
    expect(firstAlpha.bodyMarkdown).toContain("Alpha body.");
    expect(firstAlpha.bodyMarkdown).not.toContain("## Beta");
    expect(firstAlpha.children).toHaveLength(1);
    expect(firstAlpha.children[0].headingText).toBe("Beta");
    expect(firstAlpha.children[0].children[0].headingText).toBe("Gamma");
    expect(firstAlpha.children[0].bodyMarkdown).toContain("Beta body.");
    expect(firstAlpha.children[0].bodyMarkdown).not.toContain("### Gamma");
  });

  it("keeps skipped heading levels nested under the nearest parent", () => {
    const sections = buildResponseSections(`
# Parent
Text.
### Child
Child text.
`);

    const parent = findSectionByHeading(sections, "Parent");
    expect(parent).toBeDefined();
    expect(parent?.children[0].headingText).toBe("Child");
    expect(parent?.children[0].level).toBe(3);
  });

  it("renders headingless markdown as a single intro section", () => {
    const sections = buildResponseSections("Plain paragraph with **bold** text.");

    expect(sections).toHaveLength(1);
    expect(sections[0].level).toBe(0);
    expect(sections[0].children).toHaveLength(0);
    expect(sections[0].bodyHtml).toContain("Plain paragraph");
    expect(sections[0].bodyHtml).toContain("<strong>bold</strong>");
  });

  it("treats empty headings as non-collapsible", () => {
    const sections = buildResponseSections(`
# Empty

# Next
Body.
`);

    const empty = findSectionByHeading(sections, "Empty");
    const next = findSectionByHeading(sections, "Next");
    expect(empty?.isCollapsible).toBe(false);
    expect(next?.isCollapsible).toBe(true);
  });
});
