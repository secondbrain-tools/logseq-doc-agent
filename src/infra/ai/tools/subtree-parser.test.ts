import { describe, it, expect } from 'vitest';
import { parseSubtree, formatResultTree, type InsertedNode } from './subtree-parser';

describe('subtree-parser', () => {
    describe('parseSubtree', () => {
        it('should parse simple content with no lists as single block', () => {
            const input = 'Just some text content';
            const result = parseSubtree(input);

            expect(result.content).toBe('Just some text content');
            expect(result.properties).toEqual({});
            expect(result.children).toHaveLength(0);
        });

        it('should parse multiline content with no lists', () => {
            const input = 'Line one\nLine two\nLine three';
            const result = parseSubtree(input);

            expect(result.content).toBe('Line one\nLine two\nLine three');
            expect(result.children).toHaveLength(0);
        });

        it('should not split blocks on empty lines without list markers', () => {
            const input = 'Line one\n\nLine two\n\n\nLine three';
            const result = parseSubtree(input);

            expect(result.content).toBe('Line one\n\nLine two\n\n\nLine three');
            expect(result.children).toHaveLength(0);
        });

        it('should treat a heading on the very first line as block content, not a child block', () => {
            const input = '## Heading\n\nParagraph text';
            const result = parseSubtree(input);

            expect(result.content).toBe('## Heading\n\nParagraph text');
            expect(result.children).toHaveLength(0);
        });

        it('should split on a heading if it is not the first line of the block', () => {
            const input = 'Intro text\n## Heading\nParagraph text';
            const result = parseSubtree(input);

            expect(result.content).toBe('Intro text');
            expect(result.children).toHaveLength(1);
            expect(result.children[0].content).toBe('## Heading\nParagraph text');
        });

        it('should parse single-level list', () => {
            const input = '- Item 1\n- Item 2\n- Item 3';
            const result = parseSubtree(input);

            expect(result.content).toBe(''); // No preamble
            expect(result.children).toHaveLength(3);
            expect(result.children[0].content).toBe('Item 1');
            expect(result.children[1].content).toBe('Item 2');
            expect(result.children[2].content).toBe('Item 3');
        });

        it('should parse preamble with list', () => {
            const input = 'Root content here\n- Child 1\n- Child 2';
            const result = parseSubtree(input);

            expect(result.content).toBe('Root content here');
            expect(result.children).toHaveLength(2);
            expect(result.children[0].content).toBe('Child 1');
            expect(result.children[1].content).toBe('Child 2');
        });

        it('should parse nested lists with 2-space indentation', () => {
            const input = '- Parent\n  - Child\n    - Grandchild';
            const result = parseSubtree(input);

            expect(result.children).toHaveLength(1);
            expect(result.children[0].content).toBe('Parent');
            expect(result.children[0].children).toHaveLength(1);
            expect(result.children[0].children[0].content).toBe('Child');
            expect(result.children[0].children[0].children).toHaveLength(1);
            expect(result.children[0].children[0].children[0].content).toBe('Grandchild');
        });

        it('should parse nested lists with tab indentation', () => {
            const input = '- Parent\n\t- Child\n\t\t- Grandchild';
            const result = parseSubtree(input);

            expect(result.children).toHaveLength(1);
            expect(result.children[0].content).toBe('Parent');
            expect(result.children[0].children).toHaveLength(1);
            expect(result.children[0].children[0].content).toBe('Child');
            expect(result.children[0].children[0].children).toHaveLength(1);
            expect(result.children[0].children[0].children[0].content).toBe('Grandchild');
        });

        it('should extract properties', () => {
            const input = '- Block with props\n  status:: todo\n  priority:: high';
            const result = parseSubtree(input);

            expect(result.children).toHaveLength(1);
            expect(result.children[0].content).toBe('Block with props');
            expect(result.children[0].properties).toEqual({
                status: 'todo',
                priority: 'high'
            });
        });

        it('should handle properties with nested children', () => {
            const input = '- Parent\n  status:: active\n  - Child 1\n  - Child 2';
            const result = parseSubtree(input);

            expect(result.children).toHaveLength(1);
            expect(result.children[0].content).toBe('Parent');
            expect(result.children[0].properties).toEqual({ status: 'active' });
            expect(result.children[0].children).toHaveLength(2);
        });

        it('should handle complex nested structure', () => {
            const input = `Root content here
- First child
  status:: todo
  - Grandchild A
  - Grandchild B
- Second child`;

            const result = parseSubtree(input);

            expect(result.content).toBe('Root content here');
            expect(result.children).toHaveLength(2);

            const firstChild = result.children[0];
            expect(firstChild.content).toBe('First child');
            expect(firstChild.properties).toEqual({ status: 'todo' });
            expect(firstChild.children).toHaveLength(2);
            expect(firstChild.children[0].content).toBe('Grandchild A');
            expect(firstChild.children[1].content).toBe('Grandchild B');

            const secondChild = result.children[1];
            expect(secondChild.content).toBe('Second child');
            expect(secondChild.children).toHaveLength(0);
        });

        it('should handle empty lines gracefully', () => {
            const input = '- Item 1\n\n- Item 2\n\n  - Nested';
            const result = parseSubtree(input);

            expect(result.children).toHaveLength(2);
            expect(result.children[0].content).toBe('Item 1');
            expect(result.children[1].content).toBe('Item 2');
            expect(result.children[1].children).toHaveLength(1);
        });

        it('should handle list item with no content', () => {
            const input = '- \n- Item with content';
            const result = parseSubtree(input);

            expect(result.children).toHaveLength(2);
            expect(result.children[0].content).toBe('');
            expect(result.children[1].content).toBe('Item with content');
        });

        it('should handle properties with empty values', () => {
            const input = '- Block\n  empty-prop::';
            const result = parseSubtree(input);

            expect(result.children[0].properties).toEqual({ 'empty-prop': '' });
        });

        it('should handle multiline preamble', () => {
            const input = 'Line 1\nLine 2\nLine 3\n- First list item';
            const result = parseSubtree(input);

            expect(result.content).toBe('Line 1\nLine 2\nLine 3');
            expect(result.children).toHaveLength(1);
            expect(result.children[0].content).toBe('First list item');
        });

        describe('ordered list items', () => {
            it('should parse "1. " as ordered list item with ordered=true', () => {
                const input = '1. First item';
                const result = parseSubtree(input);

                expect(result.content).toBe('');
                expect(result.children).toHaveLength(1);
                expect(result.children[0].content).toBe('First item');
                expect(result.children[0].ordered).toBe(true);
            });

            it('should parse multiple ordered items', () => {
                const input = '1. Alpha\n2. Beta\n3. Gamma';
                const result = parseSubtree(input);

                expect(result.children).toHaveLength(3);
                expect(result.children[0].content).toBe('Alpha');
                expect(result.children[0].ordered).toBe(true);
                expect(result.children[1].content).toBe('Beta');
                expect(result.children[1].ordered).toBe(true);
                expect(result.children[2].content).toBe('Gamma');
                expect(result.children[2].ordered).toBe(true);
            });

            it('should set ordered=undefined for unordered items', () => {
                const input = '- Item';
                const result = parseSubtree(input);

                expect(result.children[0].ordered).toBeUndefined();
            });

            it('should parse nested ordered list with indentation', () => {
                const input = '1. Parent\n  1. Child\n    1. Grandchild';
                const result = parseSubtree(input);

                expect(result.children).toHaveLength(1);
                expect(result.children[0].content).toBe('Parent');
                expect(result.children[0].ordered).toBe(true);
                expect(result.children[0].children).toHaveLength(1);
                expect(result.children[0].children[0].content).toBe('Child');
                expect(result.children[0].children[0].ordered).toBe(true);
                expect(result.children[0].children[0].children[0].content).toBe('Grandchild');
                expect(result.children[0].children[0].children[0].ordered).toBe(true);
            });

            it('should parse mixed ordered and unordered items', () => {
                const input = '- Unordered\n1. Ordered';
                const result = parseSubtree(input);

                expect(result.children).toHaveLength(2);
                expect(result.children[0].content).toBe('Unordered');
                expect(result.children[0].ordered).toBeUndefined();
                expect(result.children[1].content).toBe('Ordered');
                expect(result.children[1].ordered).toBe(true);
            });

            it('should parse ordered item with properties', () => {
                const input = '1. Task\n  status:: done\n  priority:: high';
                const result = parseSubtree(input);

                expect(result.children).toHaveLength(1);
                expect(result.children[0].content).toBe('Task');
                expect(result.children[0].ordered).toBe(true);
                expect(result.children[0].properties).toEqual({ status: 'done', priority: 'high' });
            });

            it('should parse ordered item with mixed ordered/unordered children', () => {
                const input = '1. Parent\n  - Unordered child\n  2. Ordered child';
                const result = parseSubtree(input);

                expect(result.children).toHaveLength(1);
                expect(result.children[0].content).toBe('Parent');
                expect(result.children[0].children).toHaveLength(2);
                expect(result.children[0].children[0].content).toBe('Unordered child');
                expect(result.children[0].children[0].ordered).toBeUndefined();
                expect(result.children[0].children[1].content).toBe('Ordered child');
                expect(result.children[0].children[1].ordered).toBe(true);
            });

            it('should parse preamble followed by ordered list', () => {
                const input = 'Introduction\n1. Step one\n2. Step two';
                const result = parseSubtree(input);

                expect(result.content).toBe('Introduction');
                expect(result.children).toHaveLength(2);
                expect(result.children[0].content).toBe('Step one');
                expect(result.children[0].ordered).toBe(true);
                expect(result.children[1].content).toBe('Step two');
            });
        });
    });

    describe('formatResultTree', () => {
        it('should format single node', () => {
            const node: InsertedNode = {
                id: 123,
                content: 'Hello world',
                children: []
            };

            const result = formatResultTree(node);
            expect(result).toBe('id:123 "Hello worl..."');
        });

        it('should format node with children', () => {
            const node: InsertedNode = {
                id: 123,
                content: 'Parent block',
                children: [
                    { id: 124, content: 'Child one', children: [] },
                    { id: 125, content: 'Child two', children: [] }
                ]
            };

            const result = formatResultTree(node);
            expect(result).toContain('id:123');
            expect(result).toContain('- id:124');
            expect(result).toContain('- id:125');
        });

        it('should format deeply nested tree', () => {
            const node: InsertedNode = {
                id: 1,
                content: 'Root',
                children: [
                    {
                        id: 2,
                        content: 'Child',
                        children: [
                            { id: 3, content: 'Grandchild', children: [] }
                        ]
                    }
                ]
            };

            const result = formatResultTree(node);
            // Root at indentation 0
            expect(result).toContain('id:1');
            // Child at indentation 1 (2 spaces + -)
            expect(result).toContain('- id:2');
            // Grandchild at indentation 2 (4 spaces + -)
            expect(result).toContain('  - id:3');
        });

        it('should show error in output', () => {
            const node: InsertedNode = {
                id: 123,
                content: 'Failed block',
                children: [],
                error: 'API timeout'
            };

            const result = formatResultTree(node);
            expect(result).toContain('[ERROR: API timeout]');
        });

        it('should handle short content', () => {
            const node: InsertedNode = {
                id: 1,
                content: 'Hi',
                children: []
            };

            const result = formatResultTree(node);
            // Content should be padded to 10 chars
            expect(result).toBe('id:1 "Hi        ..."');
        });

        it('should handle content with newlines', () => {
            const node: InsertedNode = {
                id: 1,
                content: 'Line1\nLine2',
                children: []
            };

            const result = formatResultTree(node);
            // Newlines should be replaced with spaces in preview
            expect(result).toContain('Line1 Line');
        });
    });
});
