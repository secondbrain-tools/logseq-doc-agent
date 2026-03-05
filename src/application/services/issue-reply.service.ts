import type { IAIService } from '../ports/ai-service';
import type { LogseqApi } from '../ports/logseq-ports';
import type { EvaluationReviewService } from './evaluation-review.service';
import type { BlockEvaluation } from '../../domain/evaluation/entity';
import type { ISettingsPort } from '../ports/settings-port';
import { IssueReplyResponseSchema, type ContextScope, type IssueReplyResponse } from '../../domain/evaluation/issue-reply.types';
import { ModelFactory } from '../../infra/ai/model-factory';

export class IssueReplyService {
    private modelFactory = new ModelFactory();

    constructor(
        private aiService: IAIService,
        private logseq: LogseqApi,
        private evaluationReviewService: EvaluationReviewService,
        private settings: ISettingsPort
    ) { }

    private getMainModelSettings(): { modelId: string; providerId: string } {
        const defaultModel = this.settings.get('model') as string;
        if (!defaultModel) {
            throw new Error('No main model configured in settings');
        }

        const providerId = 'openai'; // Simplification, ModelFactory typically handles this better, but we can reuse the logic
        // We actually want the generateObject support.
        // But since IAIService doesn't expose generateObject natively, we might need to use Vercel AI SDK directly 
        // OR ask the LLM to output JSON and parse it. Let's use standard JSON parsing via IAIService.generateText
        return { modelId: defaultModel, providerId };
    }

    async replyToIssue(
        blockUuid: string,
        criterionId: string,
        issueIdx: number,
        evaluationData: BlockEvaluation,
        contextScope: ContextScope
    ): Promise<BlockEvaluation> {
        const criterion = evaluationData.results.find(r => r.criterion_id === criterionId);
        if (!criterion || !criterion.issues || criterion.issues.length <= issueIdx) {
            throw new Error("Issue not found");
        }
        const issue = criterion.issues[issueIdx];

        // 1. Gather Context
        const block = await this.logseq.getBlock(blockUuid);
        if (!block) throw new Error("Block not found");

        let documentContext = "";
        if (contextScope.includeDocument && block.page?.id) {
            const pageBlocks = await this.logseq.getPageBlocksTree(String(block.page.id));
            if (pageBlocks) {
                documentContext = "\n\n--- DOCUMENT CONTEXT ---\n" + this.flattenBlocks(pageBlocks);
            }
        }

        let evaluationContext = "";
        if (contextScope.includeEvaluation) {
            evaluationContext = "\n\n--- COMPLETE EVALUATION ---\n" + JSON.stringify(evaluationData, null, 2);
        }

        const conversationHistory = (issue.user_feedback || []).map(fb => {
            const role = fb.type === 'ai_reply' ? 'assistant' : 'user';
            let prefix = '';
            if (fb.type === 'change_proposal') prefix = '[THE USER PROPOSED A SPECIFIC CHANGE]: ';
            else if (fb.type === 'self_suggestion' || fb.type === 'self_assessment') prefix = '[USER PRE-COMMITMENT DATA]: ';
            return { role, content: prefix + fb.text };
        });

        // Construct the prompt
        const systemPrompt = `You are a helpful collaborative AI evaluating a text block and discussing an issue found in it.
You MUST output valid JSON matching the schema provided, AND NOTHING ELSE.Do not use markdown blocks like \`\`\`json.

YOUR GOALS:
1. Address the user's latest message or change_proposal.
2. Be critical - support the user by having your opinion and honesty, and not through flattery.
3. If there are existing AI suggestions for this issue AND the user proposed a change (change_proposal), compare the user's proposal against the existing AI suggestions. What's better? What's worse?
4. Update the issue's suggestions if appropriate (e.g., if you agree the user's proposal is better, you should add it as a new suggestion or update an existing one).
5. If you need more Context, ask for it. 

REQUIRED JSON FORMAT:
{
  "answer": "Your text response to the user's message. (Required)",
  "suggestions": [ // Optional: list of changes to issue suggestions
    {
      "action": "add" | "update" | "remove",
      "index": 0, // 0-based index of suggestion to update or remove (optional for 'add')
      "suggestion": { // optional: new/updated Suggestion object
        "op": "replace" | "insert_before" | "insert_after" | "delete" | "rewrite_span" | "rewrite_global",
        "selector": { // REQUIRED object or null for global operations
           "type": "TextQuoteSelector",
           "exact": "string",
           "prefix": "string or null",
           "suffix": "string or null"
        },
        "proposed_text": "string or null",
        "rationale": "string",
        "status": "pending" | "accepted" | "dismissed" // MUST be one of these exact strings
      }
    }
  ],
  "status": "open" | "resolved" | "ignored", // Optional: update issue status
  "updated_description": "Optional: rewritten issue description",
  "counterargument": "Optional: add/update counterargument, or null to remove"
}


--- CURRENT ISSUE CONTEXT ---
Criterion: ${criterion.criterion_id}
Reasoning: ${criterion.reason}
Issue Description: ${issue.description}
Current Suggestions: ${JSON.stringify(issue.suggestions || [])}
Current Status: ${issue.status || 'open'}

--- BLOCK CONTENT ---
${block.content}
${documentContext}
${evaluationContext}
        `;

        const messages: any[] = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory
        ];

        // 2. Call LLM with native structured output
        const { modelId, providerId } = this.getMainModelSettings();

        // Use generateObject to enforce the Zod schema natively
        const parsed: IssueReplyResponse = await this.aiService.generateObject<IssueReplyResponse>(
            messages,
            IssueReplyResponseSchema,
            modelId,
            providerId
        );

        const replyObject: IssueReplyResponse = parsed;

        // 4. Mutate Evaluation
        let updatedState: BlockEvaluation | null = null;
        await this.evaluationReviewService.mutateEvaluation(blockUuid, (ev) => {
            const r = ev.results.find(res => res.criterion_id === criterionId);
            if (!r || !r.issues || !r.issues[issueIdx]) {
                throw new Error("Invalid issue reference during mutation");
            }
            const targetIssue = r.issues[issueIdx];

            if (!targetIssue.user_feedback) targetIssue.user_feedback = [];

            // Add AI's reply to the thread
            targetIssue.user_feedback.push({
                type: 'ai_reply',
                text: replyObject.answer,
                created_at: new Date().toISOString()
            });

            if (replyObject.status) targetIssue.status = replyObject.status;
            if (replyObject.updated_description) targetIssue.description = replyObject.updated_description;
            if (replyObject.counterargument !== undefined) targetIssue.counterargument = replyObject.counterargument || undefined;

            if (replyObject.suggestions) {
                if (!targetIssue.suggestions) targetIssue.suggestions = [];
                for (const mod of replyObject.suggestions) {
                    if (mod.action === 'add' && mod.suggestion) {
                        targetIssue.suggestions.push({
                            ...mod.suggestion,
                            status: mod.suggestion.status ?? undefined
                        });
                    } else if (mod.action === 'update' && typeof mod.index === 'number' && targetIssue.suggestions[mod.index] && mod.suggestion) {
                        targetIssue.suggestions[mod.index] = {
                            ...mod.suggestion,
                            status: mod.suggestion.status ?? undefined
                        };
                    } else if (mod.action === 'remove' && typeof mod.index === 'number') {
                        targetIssue.suggestions.splice(mod.index, 1);
                    }
                }
            }

            updatedState = JSON.parse(JSON.stringify(ev)); // Capture synchronously mutated state
        });

        // 5. Return updated state immediately rather than trusting Logseq DB to return it synchronously
        if (updatedState) {
            return updatedState;
        }

        const updatedBlock = await this.logseq.getBlock(blockUuid);
        const evalString = updatedBlock?.properties?.['logseq-doc-agent.evaluation'] || updatedBlock?.properties?.['evaluation'] || updatedBlock?.properties?.['evaluationCamel'];
        return typeof evalString === 'string' ? JSON.parse(evalString) : evalString;
    }

    private flattenBlocks(blocks: any[]): string {
        let result = "";
        for (const block of blocks) {
            result += block.content + "\n";
            if (block.children && block.children.length > 0) {
                result += this.flattenBlocks(block.children);
            }
        }
        return result;
    }
}
