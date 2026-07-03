import { describe, expect, it } from 'vitest';
import { VOICE_MODE_APPEND_SYSTEM_PROMPT } from '@/voice/voiceModePrompt';
import { buildCodexTurnPrompt, hashCodexEnhancedMode, resolveCodexMessageMode } from '../runCodex';

describe('Codex voice-mode prompt handling', () => {
    it('adds the voice-mode prompt to appendSystemPrompt and turn input', () => {
        const resolved = resolveCodexMessageMode({
            content: { text: 'Summarize the diff' },
            meta: {
                voiceMode: true,
                appendSystemPrompt: 'Base app prompt.',
            },
        }, {});

        expect(resolved.mode.appendSystemPrompt).toContain('Base app prompt.');
        expect(resolved.mode.appendSystemPrompt).toContain(VOICE_MODE_APPEND_SYSTEM_PROMPT);

        const input = buildCodexTurnPrompt('Summarize the diff', resolved.mode, false);
        expect(input).toContain(VOICE_MODE_APPEND_SYSTEM_PROMPT);
        expect(input).toContain('Summarize the diff');
    });

    it('does not append the voice-mode prompt twice', () => {
        const existingPrompt = `Base app prompt.\n\n${VOICE_MODE_APPEND_SYSTEM_PROMPT}`;
        const resolved = resolveCodexMessageMode({
            content: { text: 'Explain briefly' },
            meta: {
                voiceMode: true,
                appendSystemPrompt: existingPrompt,
            },
        }, {});

        expect(resolved.mode.appendSystemPrompt).toBe(existingPrompt);
        expect(buildCodexTurnPrompt('Explain briefly', resolved.mode, false).match(/Current mode: voice/g)).toHaveLength(1);
    });

    it('keeps prompt-bearing messages in a separate mode from default messages', () => {
        const defaultMode = resolveCodexMessageMode({
            content: { text: 'Normal turn' },
            meta: {},
        }, {}).mode;
        const voiceMode = resolveCodexMessageMode({
            content: { text: 'Voice turn' },
            meta: { voiceMode: true },
        }, {}).mode;

        expect(defaultMode.appendSystemPrompt).toBeUndefined();
        expect(voiceMode.appendSystemPrompt).toContain(VOICE_MODE_APPEND_SYSTEM_PROMPT);
        expect(hashCodexEnhancedMode(defaultMode)).not.toBe(hashCodexEnhancedMode(voiceMode));
    });
});
