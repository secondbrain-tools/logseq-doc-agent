export interface SnapshotBlock {
  id: number;
  content: string;
  children: SnapshotBlock[];
}

export interface SnapshotPage {
  pageId: number;
  pageName: string;
  blocks: SnapshotBlock[];
}

export function parseSnapshot(text: string): SnapshotPage {
  const lines = text.split("\n");
  let pageId = 0;
  let pageName = "";
  const rootBlocks: SnapshotBlock[] = [];

  // Track indentation stack to build hierarchy
  // stack[depth] = block array for that depth
  const indentStack: { depth: number; blocks: SnapshotBlock[] }[] = [
    { depth: -1, blocks: rootBlocks },
  ];

  for (const line of lines) {
    // Parse page info: "Page: Merge Content (id:930)"
    if (line.startsWith("Page: ")) {
      const pageMatch = line.match(/^Page: (.*?) \(id:(\d+)\)$/);
      if (pageMatch) {
        pageName = pageMatch[1];
        pageId = parseInt(pageMatch[2], 10);
      }
      continue;
    }

    // Parse blocks: "  - id:933 Hierarchical organization: Outliners provide..."
    const blockMatch = line.match(/^(\s*)- id:(\d+)\s*(.*)$/);
    if (blockMatch) {
      const indentStr = blockMatch[1];
      const id = parseInt(blockMatch[2], 10);
      const content = blockMatch[3].trim();
      const depth = indentStr.length;

      const newBlock: SnapshotBlock = { id, content, children: [] };

      // Unwind stack until we find our parent
      while (indentStack.length > 0 && indentStack[indentStack.length - 1].depth >= depth) {
        indentStack.pop();
      }

      // The last item on the stack is our parent's child array
      const parentArray = indentStack[indentStack.length - 1].blocks;
      parentArray.push(newBlock);

      // Push ourselves onto the stack for our future children
      indentStack.push({ depth, blocks: newBlock.children });
    }
  }

  if (!pageName || !pageId) {
    throw new Error("Failed to parse page information from snapshot");
  }

  return { pageId, pageName, blocks: rootBlocks };
}
