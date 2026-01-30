import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatlogService } from './chatlog.service';
import type { IChatlogRepository } from '../ports/chatlog-repository';
import type { MiniModelRunner } from '../../infra/ai/mini-model-runner';
import type { Message } from '../../domain/chat/types';

// Mock IChatlogRepository
const createMockRepository = (): IChatlogRepository => ({
    generateId: vi.fn().mockReturnValue('mock-id'),
    saveChatlog: vi.fn().mockResolvedValue(undefined),
    loadChatlog: vi.fn().mockResolvedValue(null),
    listChatlogs: vi.fn().mockResolvedValue([]),
    deleteChatlog: vi.fn().mockResolvedValue(undefined)
});

// Mock MiniModelRunner
const createMockMiniModelRunner = (): MiniModelRunner => ({
    generateTitle: vi.fn().mockResolvedValue('AI Generated Title'),
    getMiniModelSettings: vi.fn(),
    findProviderForModel: vi.fn(),
    generate: vi.fn()
} as any as MiniModelRunner);

describe('ChatlogService', () => {
    let service: ChatlogService;
    let mockRepository: ReturnType<typeof createMockRepository>;
    let mockMiniModelRunner: ReturnType<typeof createMockMiniModelRunner>;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRepository = createMockRepository();
        mockMiniModelRunner = createMockMiniModelRunner();
        service = new ChatlogService(mockRepository, mockMiniModelRunner);
    });

    describe('generateId', () => {
        it('should delegate to repository', () => {
            service.generateId();
            expect(mockRepository.generateId).toHaveBeenCalled();
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
            service = new ChatlogService(mockRepository, mockMiniModelRunner);

            const messages: Message[] = [
                { id: '1', role: 'user', content: 'Simple question' }
            ];

            const title = await service.generateTitleAsync(messages);

            expect(title).toBe('Simple question');
        });

        it('should use fallback when no MiniModelRunner', async () => {
            service = new ChatlogService(mockRepository); // No runner

            const messages: Message[] = [
                { id: '1', role: 'user', content: 'Test question' }
            ];

            const title = await service.generateTitleAsync(messages);

            expect(title).toBe('Test question');
        });
    });

    describe('requestSave', () => {
        it('should call repository.saveChatlog with generated title', async () => {
            const messages: Message[] = [
                { id: '1', role: 'user', content: 'Hello' }
            ];

            await service.requestSave('new-id', messages, 'gpt-4', 'openai');

            expect(mockRepository.saveChatlog).toHaveBeenCalledWith(
                'new-id',
                'AI Generated Title',
                messages,
                'gpt-4',
                'openai'
            );
        });

        it('should generate title only for new chats', async () => {
            const messages: Message[] = [{ id: '1', role: 'user', content: 'Topic A' }];

            await service.requestSave('id-1', messages, 'model', 'provider');

            expect(mockMiniModelRunner.generateTitle).toHaveBeenCalledWith('First User Message: Topic A');
        });

        it('should NOT regenerate title after new user messages', async () => {
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

            expect(mockMiniModelRunner.generateTitle).toHaveBeenCalledTimes(1); // Still 1
        });

        it('should queue pending saves if saving is in progress', async () => {
            // Mock slow save
            mockRepository.saveChatlog = vi.fn().mockImplementation(async () => {
                await new Promise(resolve => setTimeout(resolve, 10));
            });

            const p1 = service.requestSave('id-queue', [{ id: '1', role: 'user', content: '1' }], 'm', 'p');
            const p2 = service.requestSave('id-queue', [{ id: '2', role: 'user', content: '2' }], 'm', 'p');
            const p3 = service.requestSave('id-queue', [{ id: '3', role: 'user', content: '3' }], 'm', 'p');

            await Promise.all([p1, p2, p3]);

            expect(mockRepository.saveChatlog).toHaveBeenCalled();
        });
    });

    describe('listChatlogs', () => {
        it('should delegate to repository', async () => {
            const mockList = [{ id: '1', title: 'Test', created: '', updated: '', messageCount: 1 }];
            mockRepository.listChatlogs = vi.fn().mockResolvedValue(mockList);

            const result = await service.listChatlogs();

            expect(mockRepository.listChatlogs).toHaveBeenCalled();
            expect(result).toEqual(mockList);
        });
    });

    describe('deleteChatlog', () => {
        it('should delegate to repository', async () => {
            await service.deleteChatlog('delete-id');
            expect(mockRepository.deleteChatlog).toHaveBeenCalledWith('delete-id');
        });
    });
});
