import type { BuiltInPromptConfig } from '../prompt/built-in-prompts';



export const BASIC_SUMMARY_PROMPT_CONFIG: BuiltInPromptConfig = {
    name: 'Structured Summary',
    version: 1,
    text: `Read the text carefully and produce a concise but complete summary.
           If no Text is provided, read the current Document.
           If not requested otherwise, answer in the users language.
Steps:
1. Identify the main topic and objective.
2. Extract the key arguments or ideas.
3. Find Evidence or Examples.
4. Remove redundant or supporting details.
5. Make a final Conclusion.
6. Rewrite the information clearly and logically.
`,

};
