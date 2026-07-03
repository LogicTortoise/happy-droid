import { describe, expect, it } from 'vitest';
import { VOICE_MODE_APPEND_SYSTEM_PROMPT, appendVoiceModeSystemPrompt } from './voiceModePrompt';

describe('voiceModePrompt', () => {
    it('appends the voice-mode prompt to an existing append system prompt', () => {
        const prompt = appendVoiceModeSystemPrompt('Base prompt.');

        expect(prompt).toContain('Base prompt.');
        expect(prompt).toContain(VOICE_MODE_APPEND_SYSTEM_PROMPT);
    });

    it('uses only the voice-mode prompt when no base prompt exists', () => {
        expect(appendVoiceModeSystemPrompt(null)).toBe(VOICE_MODE_APPEND_SYSTEM_PROMPT);
        expect(appendVoiceModeSystemPrompt('   ')).toBe(VOICE_MODE_APPEND_SYSTEM_PROMPT);
    });

    it('does not append the voice-mode prompt twice', () => {
        const base = `Base prompt.\n\n${VOICE_MODE_APPEND_SYSTEM_PROMPT}`;

        expect(appendVoiceModeSystemPrompt(base)).toBe(base);
    });
});
