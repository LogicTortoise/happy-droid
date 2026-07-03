import { describe, expect, it } from 'vitest';
import { ANDROID_RECOGNIZER_RESULTS, VOICE_MODE_APPEND_SYSTEM_PROMPT, appendVoiceModeSystemPrompt, extractSpeechRecognitionText, sanitizeTextForSpeech } from './voiceMode';

describe('voiceMode helpers', () => {
    it('sanitizes markdown into readable TTS text', () => {
        const text = [
            '# Result',
            '',
            'Here is **the answer** with [a link](https://example.com).',
            '',
            '```ts',
            'const ignored = true;',
            '```',
            '',
            '- `inline code` stays readable',
        ].join('\n');

        expect(sanitizeTextForSpeech(text)).toBe('Result Here is the answer with a link. inline code stays readable');
    });

    it('extracts Android recognizer results from standard extra key', () => {
        expect(extractSpeechRecognitionText({
            [ANDROID_RECOGNIZER_RESULTS]: [' send the report ', 'ignored'],
        })).toBe('send the report');
    });

    it('returns null when recognizer extras contain no text', () => {
        expect(extractSpeechRecognitionText({ [ANDROID_RECOGNIZER_RESULTS]: [] })).toBeNull();
        expect(extractSpeechRecognitionText(null)).toBeNull();
    });

    it('appends the voice-mode concise response instruction to a base prompt', () => {
        const prompt = appendVoiceModeSystemPrompt('Base system prompt.');

        expect(prompt).toContain('Base system prompt.');
        expect(prompt).toContain(VOICE_MODE_APPEND_SYSTEM_PROMPT);
        expect(appendVoiceModeSystemPrompt('  ')).toBe(VOICE_MODE_APPEND_SYSTEM_PROMPT);
    });
});
