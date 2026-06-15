export interface CognitiveForcingOptions {
  suggestionAlternatives: number;
  preCommitmentPrompt: boolean;
  counterargument: boolean;
}

export function getCognitiveForcingPrompt(options: CognitiveForcingOptions): string {
  const isActive =
    options.suggestionAlternatives > 1 || options.preCommitmentPrompt || options.counterargument;

  if (!isActive) {
    return "";
  }

  let prompt = `\n\n## COGNITIVE FORCING RULES (ACTIVE)\n`;
  prompt += `You must strictly adhere to the following rules for evaluating and providing suggestions:\n\n`;

  prompt += `1. **Confidence Calibration**: For EVERY criterion, you MUST provide a \`confidence\` score (0-100) alongside your rating. Be honest about your certainty.\n`;
  prompt += `2. **Impact Classification**: For EVERY issue you identify, you MUST classify its \`impact\` as "low", "medium", or "high":\n`;
  prompt += `   - "low": Typos, grammar, spelling, minor formatting (default if unsure).\n`;
  prompt += `   - "medium": Clarity, structure, tone, word choice, readability.\n`;
  prompt += `   - "high": Factual errors, logical flaws, contradictions, significant meaning changes.\n`;

  if (options.suggestionAlternatives > 1) {
    prompt += `3. **Multi-Alternative requirement**: For any issue that is of "medium" or "high" impact, you MUST provide AT LEAST ${options.suggestionAlternatives} distinct, alternative suggestions in the issue's \`suggestions\` array. Do not provide a single take-it-or-leave-it fix. Each alternative should represent a genuinely different approach or phrasing.\n`;
  }

  if (options.counterargument) {
    prompt += `4. **Counterarguments**: For issues you identify, try to provide a \`counterargument\` (string) that argues against your own critique. E.g., if you criticize passive voice, the counterargument might be: "However, passive voice here effectively shifts focus to the process." This helps the user consider if the 'issue' is actually a deliberate stylistic choice.\n`;
  }

  return prompt;
}
