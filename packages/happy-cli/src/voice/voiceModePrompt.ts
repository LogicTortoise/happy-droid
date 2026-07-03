export const VOICE_MODE_APPEND_SYSTEM_PROMPT = [
    'Current mode: voice.',
    'Reply in 1-3 concise, conversational sentences.',
    'Lead with the answer and avoid code blocks, long lists, and verbose explanations unless the user explicitly asks for them.',
].join(' ');

export function appendVoiceModeSystemPrompt(basePrompt: string | null | undefined): string {
    const trimmed = basePrompt?.trim() ?? '';
    if (!trimmed) {
        return VOICE_MODE_APPEND_SYSTEM_PROMPT;
    }
    if (trimmed.includes(VOICE_MODE_APPEND_SYSTEM_PROMPT)) {
        return trimmed;
    }
    return `${trimmed}\n\n${VOICE_MODE_APPEND_SYSTEM_PROMPT}`;
}
