import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogseqChatlogRepository } from './chatlog-repository';
import type { LogseqApi, IAsyncStorage } from '../../application/ports/logseq-ports';
import type { Message } from '../../domain/chat/types';

// Mock LogseqApi
const createMockLogseqApi = (): LogseqApi => ({
    getPage: vi.fn(),
    createPage: vi.fn(),
    renamePage: vi.fn(),
    deletePage: vi.fn(),
    getPageBlocksTree: vi.fn().mockResolvedValue([]),
    appendBlockInPage: vi.fn().mockResolvedValue({ uuid: 'new-block-uuid' }),
    insertBlock: vi.fn().mockResolvedValue({ uuid: 'inserted-block-uuid' }),
    updateBlock: vi.fn(),
    q: vi.fn().mockResolvedValue([]),
    upsertPageProperty: vi.fn(),
    deleteBlock: vi.fn(),
    upsertBlockProperty: vi.fn(),
    getBlock: vi.fn(),
    getCurrentPage: vi.fn(),
} as any);

// Mock storage
const createMockStorage = (): IAsyncStorage => ({
    getItem: vi.fn().mockResolvedValue(undefined),
    setItem: vi.fn().mockResolvedValue(undefined),
    removeItem: vi.fn().mockResolvedValue(undefined),
    hasItem: vi.fn().mockResolvedValue(false),
    allKeys: vi.fn().mockResolvedValue([]),
    clear: vi.fn().mockResolvedValue(undefined),
});

describe('LogseqChatlogRepository - JSON File Storage', () => {
    let repo: LogseqChatlogRepository;
    let mockApi: LogseqApi;
    let mockStorage: IAsyncStorage;
    let capturedBlockContent: string = '';

    beforeEach(() => {
        vi.clearAllMocks();
        mockApi = createMockLogseqApi();
        mockStorage = createMockStorage();

        // Add mock storage to API
        (mockApi as any).getPluginStorage = () => mockStorage;
        (mockApi as any).getGraphStorage = () => mockStorage;

        repo = new LogseqChatlogRepository(mockApi, () => 'test-storage');

        // Capture the block content when appendBlockInPage is called
        (mockApi.appendBlockInPage as any).mockImplementation(async (_page: string, content: string) => {
            capturedBlockContent = content;
            return { uuid: 'test-uuid' };
        });
    });

    describe('saveChatlog', () => {
        it('should save messages to JSON file', async () => {
            const messages: Message[] = [
                { id: '1', role: 'user', content: 'Hello world' },
                { id: '2', role: 'assistant', content: 'Hi there!' }
            ];

            await repo.saveChatlog('test-id', 'Test Chat', messages, 'gpt-4', 'openai');

            // Should save to storage
            expect(mockStorage.setItem).toHaveBeenCalledWith(
                'chatlogs/test-id.json',
                expect.any(String)
            );

            // Verify JSON structure
            const savedJson = JSON.parse((mockStorage.setItem as any).mock.calls[0][1]);
            expect(savedJson.id).toBe('test-id');
            expect(savedJson.title).toBe('Test Chat');
            expect(savedJson.model).toBe('gpt-4');
            expect(savedJson.provider).toBe('openai');
            expect(savedJson.messages).toHaveLength(2);
            expect(savedJson.messages[0].content).toBe('Hello world');
        });

        it('should create page with link to JSON file', async () => {
            const messages: Message[] = [
                { id: '1', role: 'user', content: 'Hello' }
            ];

            await repo.saveChatlog('test-id', 'Test Chat', messages, 'gpt-4', 'openai');

            // Should append a block with link
            expect(capturedBlockContent).toContain('📁');
            expect(capturedBlockContent).toContain('chatlogs/test-id.json');
            expect(capturedBlockContent).toContain('View chatlog data');
            expect(capturedBlockContent).toContain('1 messages');
        });

        it('should update page properties', async () => {
            const messages: Message[] = [
                { id: '1', role: 'user', content: 'Hello' }
            ];

            await repo.saveChatlog('test-id', 'Test Chat', messages, 'gpt-4', 'openai');

            expect(mockApi.upsertPageProperty).toHaveBeenCalledWith(
                'test-storage/chatlogs/Test Chat',
                'lda.chatlog.updated',
                expect.any(String)
            );
            expect(mockApi.upsertPageProperty).toHaveBeenCalledWith(
                'test-storage/chatlogs/Test Chat',
                'lda.chatlog.model',
                'gpt-4'
            );
            expect(mockApi.upsertPageProperty).toHaveBeenCalledWith(
                'test-storage/chatlogs/Test Chat',
                'lda.chatlog.provider',
                'openai'
            );
        });

        it('should still work when FileStorage is not available', async () => {
            // Remove storage
            (mockApi as any).getPluginStorage = () => null;
            (mockApi as any).getGraphStorage = () => null;

            const messages: Message[] = [
                { id: '1', role: 'user', content: 'Hello' }
            ];

            // Should not throw
            await repo.saveChatlog('test-id', 'Test Chat', messages, 'gpt-4', 'openai');

            // Storage should not have been called
            expect(mockStorage.setItem).not.toHaveBeenCalled();

            // Page should still be created
            expect(mockApi.createPage).toHaveBeenCalled();
        });
    });

    describe('loadChatlog', () => {
        it('should load messages from JSON file', async () => {
            const storedData = {
                id: 'test-id',
                title: 'Test Chat',
                model: 'gpt-4',
                provider: 'openai',
                messages: [
                    { id: '1', role: 'user', content: 'Hello world' },
                    { id: '2', role: 'assistant', content: 'Hi there!' }
                ],
                updated: new Date().toISOString()
            };

            // Mock findPageById to return page name
            (mockApi.q as any).mockResolvedValue([{
                originalName: 'test-storage/chatlogs/Test Chat'
            }]);

            // Mock getPage
            (mockApi.getPage as any).mockResolvedValue({
                originalName: 'test-storage/chatlogs/Test Chat',
                properties: {},
                createdAt: Date.now(),
                updatedAt: Date.now()
            });

            // Mock storage to return the JSON
            (mockStorage.getItem as any).mockResolvedValue(JSON.stringify(storedData));

            const result = await repo.loadChatlog('test-id');

            expect(result).not.toBeNull();
            expect(result!.messages).toHaveLength(2);
            expect(result!.messages[0].content).toBe('Hello world');
            expect(result!.metadata.title).toBe('Test Chat');
        });

        it('should fall back to block parsing when JSON file not found', async () => {
            // Mock findPageById to return page name
            (mockApi.q as any).mockResolvedValue([{
                originalName: 'test-storage/chatlogs/Legacy Chat'
            }]);

            // Mock getPage
            (mockApi.getPage as any).mockResolvedValue({
                originalName: 'test-storage/chatlogs/Legacy Chat',
                properties: {},
                createdAt: Date.now(),
                updatedAt: Date.now()
            });

            // Mock storage to return undefined (no JSON file)
            (mockStorage.getItem as any).mockResolvedValue(undefined);

            // Mock getPageBlocksTree to return legacy block structure
            (mockApi.getPageBlocksTree as any).mockResolvedValue([
                {
                    content: 'lda.chatlog.role:: user\nHello legacy world',
                    children: []
                }
            ]);

            const result = await repo.loadChatlog('legacy-id');

            expect(result).not.toBeNull();
            // Should have fallen back to block parsing
            expect(mockApi.getPageBlocksTree).toHaveBeenCalled();
        });
    });

    describe('Messages with parts', () => {
        it('should preserve message parts in JSON storage', async () => {
            const messages: Message[] = [{
                id: '1',
                role: 'assistant',
                content: '',
                parts: [
                    { type: 'reasoning', text: 'Let me think...' },
                    { type: 'content', text: 'Here is my answer.' },
                    {
                        type: 'tool_call',
                        toolCallId: 'call-123',
                        toolName: 'search',
                        toolArgs: { query: 'test' }
                    }
                ]
            }];

            await repo.saveChatlog('test-id', 'Test Chat', messages, 'gpt-4', 'openai');

            // Verify the parts are preserved in JSON
            const savedJson = JSON.parse((mockStorage.setItem as any).mock.calls[0][1]);
            expect(savedJson.messages[0].parts).toHaveLength(3);
            expect(savedJson.messages[0].parts[0].type).toBe('reasoning');
            expect(savedJson.messages[0].parts[1].type).toBe('content');
            expect(savedJson.messages[0].parts[2].type).toBe('tool_call');
            expect(savedJson.messages[0].parts[2].toolName).toBe('search');
        });
    });
});
