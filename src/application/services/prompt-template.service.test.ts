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

    const basePage = `${LDA_NAMESPACE}/prompts/base`;
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
            isBase: name === 'base',
        };
    }

    describe('getBasePrompt', () => {
        it('should return null if no base prompt exists', async () => {
            mockPromptRepo.getChatPrompts.mockResolvedValue([]);
            const result = await service.getBasePrompt();
            expect(result).toBeNull();
        });

        it('should return the base prompt from namespace', async () => {
            const prompt = createPrompt('base', 'Namespace Base Content', basePage);
            mockPromptRepo.getChatPrompts.mockResolvedValue([prompt]);

            const result = await service.getBasePrompt();
            expect(result).toEqual(prompt);
        });

        it('should prefer base prompt outside namespace over namespace one', async () => {
            const nsPrompt = createPrompt('base', 'Namespace Base Content', basePage);
            const userPrompt = createPrompt('base', 'User Base Content', customPage);

            mockPromptRepo.getChatPrompts.mockResolvedValue([nsPrompt, userPrompt]);

            const result = await service.getBasePrompt();
            expect(result).toEqual(userPrompt);
            expect(mockLogseqApi.UI.showMsg).not.toHaveBeenCalled();
        });

        it('should show warning if multiple user base prompts exist', async () => {
            const userPrompt1 = createPrompt('base', 'User Content 1', customPage);
            const userPrompt2 = createPrompt('base', 'User Content 2', 'Another Page');

            mockPromptRepo.getChatPrompts.mockResolvedValue([userPrompt1, userPrompt2]);

            const result = await service.getBasePrompt();
            expect(result).toEqual(userPrompt1);
            expect(mockLogseqApi.UI.showMsg).toHaveBeenCalledWith(
                expect.stringContaining('Multiple prompts found with name "base" outside the namespace'),
                'warning'
            );
        });
    });

    describe('listPrompts', () => {
        it('should list all available prompts avoiding base prompt', async () => {
            mockPromptRepo.getChatPrompts.mockResolvedValue([
                createPrompt('base', 'Base', basePage),
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
                createPrompt('translate', 'Namespace Translate', basePage),
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
