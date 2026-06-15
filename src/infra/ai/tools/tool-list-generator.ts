import { createTools, READONLY_TOOLS, WRITE_TOOLS } from "./index";

export const TOOL_LIST_VERSION = 1;

function firstLine(description: string): string {
  const line = description.split("\n")[0].trim();
  return line || description.trim();
}

export function generateToolListString(version: number = TOOL_LIST_VERSION): string {
  const tools = createTools({ merge: false, mergeDefault: false, mergeBoth: false });

  // The title line uses ## so parseSubtree treats it as a list item (header block).
  // Categories and tools are indented under it so they become children of that block.
  const lines: string[] = [
    `## Available Tool List`,
    `logseq-doc-agent.tool-list-version:: ${version}`,
  ];

  lines.push("  - ### readonly tools");
  for (const name of READONLY_TOOLS) {
    const t = (tools as Record<string, any>)[name];
    lines.push(`    - ${name}`);
    if (t?.description) {
      lines.push(`      - ${firstLine(t.description)}`);
    }
  }

  lines.push("  - ### write tools");
  for (const name of WRITE_TOOLS) {
    const t = (tools as Record<string, any>)[name];
    lines.push(`    - ${name}`);
    if (t?.description) {
      lines.push(`      - ${firstLine(t.description)}`);
    }
  }

  return lines.join("\n");
}
