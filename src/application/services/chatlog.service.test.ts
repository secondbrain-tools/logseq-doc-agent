import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatlogService } from './chatlog.service';
import type { LogseqApi } from '../ports/logseq-ports';
import type { MiniModelRunner } from '../../infra/ai/mini-model-runner';
import type { Message } from '../../domain/chat/types';

// Mock LogseqApi
const createMockLogseqApi = (): LogseqApi => ({
    getCurrentGraph: vi.fn(),
    getCurrentPage: vi.fn(),
    appendBlockInPage: vi.fn().mockResolvedValue({ uuid: 'new-block-uuid' }),
    insertBlock: vi.fn().mockResolvedValue({ uuid: 'inserted-block-uuid' }),
    getPage: vi.fn(),
    createPage: vi.fn().mockResolvedValue({}),
    renamePage: vi.fn(),
    deletePage: vi.fn(),
    getPageBlocksTree: vi.fn().mockResolvedValue([]),
    datascriptQuery: vi.fn().mockResolvedValue([]),
    q: vi.fn().mockResolvedValue([]),
    registerSlashCommand: vi.fn(),
    registerBlockContextMenuItem: vi.fn(),
    registerUIItem: vi.fn(),
    provideModel: vi.fn(),
    queryBlocks: vi.fn().mockResolvedValue([]),
    UI: {
        showMsg: vi.fn()
    },
    Editor: {
        getBlock: vi.fn(),
        getBlockPropertyContent: vi.fn(),
        getBlockText: vi.fn()
    }
});

// Mock MiniModelRunner
const createMockMiniModelRunner = (): MiniModelRunner => ({
    generateTitle: vi.fn().mockResolvedValue('AI Generated Title'),
    modelFactory: {} as any,
    getMiniModelSettings: vi.fn(),
    findProviderForModel: vi.fn(),
    generate: vi.fn()
});

describe('ChatlogService', () => {
    let service: ChatlogService;
    let mockLogseqApi: ReturnType<typeof createMockLogseqApi>;
    let mockMiniModelRunner: ReturnType<typeof createMockMiniModelRunner>;
    const mockGetStorageRoot = () => 'test-storage';

    beforeEach(() => {
        vi.clearAllMocks();
        mockLogseqApi = createMockLogseqApi();
        mockMiniModelRunner = createMockMiniModelRunner();
        service = new ChatlogService(mockLogseqApi, mockGetStorageRoot, mockMiniModelRunner);
    });

    describe('generateId', () => {
        it('should generate a unique ID with date prefix', () => {
            const id = service.generateId();
            expect(id).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9]{6}$/);
        });

        it('should generate different IDs on each call', () => {
            const id1 = service.generateId();
            const id2 = service.generateId();
            expect(id1).not.toBe(id2);
        });
    });

    describe('generateTitle', () => {
        it('should return "New Chat" when no user messages', () => {
            const messages: Message[] = [
                { id: '1', role: 'assistant', content: 'Hello!' }
            ];

            const title = service.generateTitle(messages);
            expect(title).toBe('New Chat');
        });

        it('should use first user message content if <= 50 chars', () => {
            const messages: Message[] = [
                { id: '1', role: 'user', content: 'Short question' }
            ];

            const title = service.generateTitle(messages);
            expect(title).toBe('Short question');
        });

        it('should truncate long messages to 47 chars with ellipsis', () => {
            const longContent = 'This is a very long message that exceeds the fifty character limit and should be truncated';
            const messages: Message[] = [
                { id: '1', role: 'user', content: longContent }
            ];

            const title = service.generateTitle(messages);
            expect(title.length).toBe(50);
            expect(title.endsWith('...')).toBe(true);
        });
    });

    describe('generateTitleAsync', () => {
        it('should use MiniModelRunner with formatted context', async () => {
            const messages: Message[] = [
                { id: '1', role: 'user', content: 'What is AI?' }
            ];

            const title = await service.generateTitleAsync(messages);

            expect(mockMiniModelRunner.generateTitle).toHaveBeenCalledWith(
                'First User Message: What is AI?'
            );
            expect(title).toBe('AI Generated Title');
        });

        it('should include first and last interaction for long history', async () => {
            const messages: Message[] = [
                { id: '1', role: 'user', content: 'First Q' },
                { id: '2', role: 'assistant', content: 'First A' },
                { id: '3', role: 'user', content: 'Middle Q' },
                { id: '4', role: 'assistant', content: 'Middle A' },
                { id: '5', role: 'user', content: 'Last Q' },
                { id: '6', role: 'assistant', content: 'Last A' }
            ];

            await service.generateTitleAsync(messages);

            const expectedContext =
                `First User Message: First Q
First Model Answer: First A

Last User Message: Last Q
Last Model Answer: Last A`;

            expect(mockMiniModelRunner.generateTitle).toHaveBeenCalledWith(expectedContext);
        });

        it('should fallback to simple title when AI fails', async () => {
            mockMiniModelRunner.generateTitle = vi.fn().mockRejectedValue(new Error('API Error'));
            service = new ChatlogService(mockLogseqApi, mockGetStorageRoot, mockMiniModelRunner);

            const messages: Message[] = [
                { id: '1', role: 'user', content: 'Simple question' }
            ];

            const title = await service.generateTitleAsync(messages);

            expect(title).toBe('Simple question');
        });

        it('should use fallback when no MiniModelRunner', async () => {
            service = new ChatlogService(mockLogseqApi, mockGetStorageRoot); // No runner

            const messages: Message[] = [
                { id: '1', role: 'user', content: 'Test question' }
            ];

            const title = await service.generateTitleAsync(messages);

            expect(title).toBe('Test question');
        });
    });

    describe('requestSave', () => {
        it('should create a new page and save messages', async () => {
            const messages: Message[] = [
                { id: '1', role: 'user', content: 'Hello' }
            ];

            await service.requestSave('new-id', messages, 'gpt-4', 'openai');

            expect(mockLogseqApi.createPage).toHaveBeenCalledWith(
                'test-storage/chatlogs/AI Generated Title',
                { 'lda.chatlog.id': 'new-id' },
                { createFirstBlock: false, redirect: false }
            );
        });

        it('should append messages as nested blocks with escaping', async () => {
            const messages: Message[] = [
                { id: '1', role: 'user', content: '- Item 1' },
                { id: '2', role: 'assistant', content: 'Answer' }
            ];

            await service.requestSave('test-id', messages, 'model', 'provider');

            // Escape check
            expect(mockLogseqApi.appendBlockInPage).toHaveBeenCalled();
            const firstBlockContent = (mockLogseqApi.appendBlockInPage as any).mock.calls[0][1];
            expect(firstBlockContent).toContain('* Item 1');

            // Nested block check
            expect(mockLogseqApi.insertBlock).toHaveBeenCalledWith(
                'new-block-uuid',
                expect.any(String),
                { sibling: false }
            );
        });

        it('should generate title only for new chats', async () => {
            const messages: Message[] = [{ id: '1', role: 'user', content: 'Topic A' }];

            await service.requestSave('id-1', messages, 'model', 'provider');

            expect(mockMiniModelRunner.generateTitle).toHaveBeenCalledWith('First User Message: Topic A');
        });

        it('should regenerate title after 3 new user messages', async () => {
            // First save
            let messages: Message[] = [{ id: '1', role: 'user', content: 'Msg 1' }];
            await service.requestSave('id-1', messages, 'model', 'provider');
            expect(mockMiniModelRunner.generateTitle).toHaveBeenCalledTimes(1);

            // Add messages until 3 new user messages since last generation
            messages = [
                { id: '1', role: 'user', content: 'Msg 1' },
                { id: '2', role: 'assistant', content: 'Ans 1' },
                { id: '3', role: 'user', content: 'Msg 2' },
                { id: '4', role: 'assistant', content: 'Ans 2' },
                { id: '5', role: 'user', content: 'Msg 3' },
                { id: '6', role: 'assistant', content: 'Ans 3' },
                { id: '7', role: 'user', content: 'Msg 4' }
            ];

            await service.requestSave('id-1', messages, 'model', 'provider');

            expect(mockMiniModelRunner.generateTitle).toHaveBeenCalledTimes(2);
        });

        it('should queue pending saves if saving is in progress', async () => {
            // Mock slow createPage
            mockLogseqApi.createPage = vi.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
                return {};
            });

            const p1 = service.requestSave('id-queue', [{ id: '1', role: 'user', content: '1' }], 'm', 'p');
            const p2 = service.requestSave('id-queue', [{ id: '2', role: 'user', content: '2' }], 'm', 'p');
            const p3 = service.requestSave('id-queue', [{ id: '3', role: 'user', content: '3' }], 'm', 'p');

            await Promise.all([p1, p2, p3]);

            expect(mockLogseqApi.createPage).toHaveBeenCalled();
        });

        it('should rename page if title changes', async () => {
            // Mock existing page with old title name
            mockLogseqApi.q = vi.fn().mockResolvedValue([
                { 'originalName': 'test-storage/chatlogs/Old Title' }
            ]);

            // Mock new title generation
            mockMiniModelRunner.generateTitle = vi.fn().mockResolvedValue('New Title');

            // Force title generation by ensuring no cached title (default in new service instance)
            const messages: Message[] = [{ id: '1', role: 'user', content: 'Trigger Rename' }];

            await service.requestSave('id-rename', messages, 'model', 'provider');

            expect(mockLogseqApi.renamePage).toHaveBeenCalledWith(
                'test-storage/chatlogs/Old Title',
                'test-storage/chatlogs/New Title',
                { silent: true }
            );

            // Verify subsequent operations use the new name
            expect(mockLogseqApi.getPageBlocksTree).toHaveBeenCalledWith('test-storage/chatlogs/New Title');
        });
    });

    describe('listChatlogs', () => {
        it('should return empty array when no chatlogs exist', async () => {
            mockLogseqApi.q = vi.fn().mockResolvedValue([]);

            const result = await service.listChatlogs();

            expect(result).toEqual([]);
        });

        it('should parse chatlog metadata from query results', async () => {
            mockLogseqApi.q = vi.fn().mockResolvedValue([
                {
                    'originalName': 'test-storage/chatlogs/My Chat',
                    name: 'test-storage/chatlogs/my chat',
                    properties: {
                        'lda-chatlog-id': 'chat-123'
                    },
                    updatedAt: Date.now()
                }
            ]);

            const result = await service.listChatlogs();

            expect(result).toHaveLength(1);
            expect(result[0].id).toBe('chat-123');
            expect(result[0].title).toBe('My Chat');
        });
    });

    describe('deleteChatlog', () => {
        it('should delete the page for a chatlog', async () => {
            mockLogseqApi.q = vi.fn().mockResolvedValue([
                { 'originalName': 'test-storage/chatlogs/To Delete' }
            ]);

            await service.deleteChatlog('delete-id');

            expect(mockLogseqApi.deletePage).toHaveBeenCalledWith('test-storage/chatlogs/To Delete');
        });

        it('should not throw when chatlog not found', async () => {
            mockLogseqApi.q = vi.fn().mockResolvedValue([]);

            await expect(service.deleteChatlog('non-existent')).resolves.not.toThrow();
        });
    });
});
