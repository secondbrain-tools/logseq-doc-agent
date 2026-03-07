import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromptTemplateService } from './prompt-template.service';
import type { PromptRepository } from '../ports/prompt-repo';
import type { LogseqApi } from '../ports/logseq-ports';
import type { ChatPrompt } from '../../domain/chat/prompt';
import { LDA_NAMESPACE } from '../../domain/logseq/properties';

describe('PromptTemplateService', () => {
    let mockPromptRepo: import('vitest').Mocked<PromptRepository>;
    let mockLogseqApi: import('vitest').Mocked<LogseqApi>;
    let service: PromptTemplateService;

    const systemPage = `${LDA_NAMESPACE}/prompts/system`;
    const customPage = 'Custom Prompts';

    beforeEach(() => {
        mockPromptRepo = {
            getFeedbackPrompts: vi.fn(),
            getChatPrompts: vi.fn(),
        };

        mockLogseqApi = {
            UI: { showMsg: vi.fn() },
            DB: { q: vi.fn() },
            Editor: { getBlock: vi.fn() },
        } as any;

        service = new PromptTemplateService(mockPromptRepo, mockLogseqApi);
    });

    function createPrompt(name: string, content: string, pageName: string): ChatPrompt {
        return {
            id: 'uuid-' + Math.random(),
            name,
            content,
            pageName,
            isBase: name === 'system',
        };
    }

    describe('getSystemPrompt', () => {
        it('should return null if no system prompt exists', async () => {
            mockPromptRepo.getChatPrompts.mockResolvedValue([]);
            const result = await service.getSystemPrompt();
            expect(result).toBeNull();
        });

        it('should return the system prompt from namespace', async () => {
            const prompt = createPrompt('system', 'Namespace System Content', systemPage);
            mockPromptRepo.getChatPrompts.mockResolvedValue([prompt]);

            const result = await service.getSystemPrompt();
            expect(result).toEqual(prompt);
        });

        it('should prefer system prompt outside namespace over namespace one', async () => {
            const nsPrompt = createPrompt('system', 'Namespace System Content', systemPage);
            const userPrompt = createPrompt('system', 'User System Content', customPage);

            mockPromptRepo.getChatPrompts.mockResolvedValue([nsPrompt, userPrompt]);

            const result = await service.getSystemPrompt();
            expect(result).toEqual(userPrompt);
            expect(mockLogseqApi.UI.showMsg).not.toHaveBeenCalled();
        });

        it('should show warning if multiple user system prompts exist', async () => {
            const userPrompt1 = createPrompt('system', 'User Content 1', customPage);
            const userPrompt2 = createPrompt('system', 'User Content 2', 'Another Page');

            mockPromptRepo.getChatPrompts.mockResolvedValue([userPrompt1, userPrompt2]);

            const result = await service.getSystemPrompt();
            expect(result).toEqual(userPrompt1);
            expect(mockLogseqApi.UI.showMsg).toHaveBeenCalledWith(
                expect.stringContaining('Multiple prompts found with name "system" outside the namespace'),
                'warning'
            );
        });
    });

    describe('listPrompts', () => {
        it('should list all available prompts avoiding system prompt', async () => {
            mockPromptRepo.getChatPrompts.mockResolvedValue([
                createPrompt('system', 'System', systemPage),
                createPrompt('write', 'Write Content', customPage),
                createPrompt('refactor', 'Refactor Content', customPage),
            ]);

            const list = await service.listPrompts();
            expect(list).toHaveLength(2);
            expect(list[0].name).toBe('refactor'); // Alphabetical order
            expect(list[1].name).toBe('write');
        });

        it('should resolve duplicates by preferring outside namespace', async () => {
            mockPromptRepo.getChatPrompts.mockResolvedValue([
                createPrompt('translate', 'Namespace Translate', systemPage),
                createPrompt('translate', 'User Translate', customPage),
            ]);

            const list = await service.listPrompts();
            expect(list).toHaveLength(1);
            expect(list[0].content).toBe('User Translate');
        });
    });

    describe('resolvePromptContent', () => {
        it('should return prompt content if found', async () => {
            mockPromptRepo.getChatPrompts.mockResolvedValue([
                createPrompt('test', 'Test Content', customPage)
            ]);

            const content = await service.resolvePromptContent('test');
            expect(content).toBe('Test Content');
        });

        it('should return null if not found', async () => {
            mockPromptRepo.getChatPrompts.mockResolvedValue([]);
            const content = await service.resolvePromptContent('test');
            expect(content).toBeNull();
        });
    });
});
