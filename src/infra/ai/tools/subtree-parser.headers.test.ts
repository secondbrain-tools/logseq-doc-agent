import { describe, it, expect } from 'vitest';
import { parseSubtree } from './subtree-parser';

describe('parseSubtree headers', () => {
  it('should parse headers as new sibling blocks', () => {
    const input = `content
# heading
some more content
## sub heading`;
    const result = parseSubtree(input);

    expect(result.content).toBe('content');
    expect(result.children.length).toBe(2);
    expect(result.children[0].content).toBe('# heading\nsome more content');
    expect(result.children[1].content).toBe('## sub heading');
  });

  it('should handle headers with children', () => {
    const input = `content
# heading
  - child 1
  - child 2
# heading 2
  some content
  ## heading 2.1
    nested content`;
    const result = parseSubtree(input);

    expect(result.content).toBe('content');
    expect(result.children.length).toBe(2);

    const h1 = result.children[0];
    expect(h1.content).toBe('# heading');
    expect(h1.children.length).toBe(2);
    expect(h1.children[0].content).toBe('child 1');

    const h2 = result.children[1];
    expect(h2.content).toBe('# heading 2\nsome content');
    expect(h2.children.length).toBe(1);
    expect(h2.children[0].content).toBe('## heading 2.1\nnested content');
  });
});
