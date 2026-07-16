import { describe, expect, it } from 'vitest';

import { CHANGE_TITLE_INSTRUCTION } from '@/gemini/constants';
import { VOICE_MODE_APPEND_SYSTEM_PROMPT } from '@/utils/voiceModePrompt';
import {
    buildCodexTurnPrompt,
    hashCodexEnhancedMode,
    sendCodexTurnWithPrompt,
    type CodexEnhancedMode,
} from './codexPrompt';

describe('buildCodexTurnPrompt', () => {
    it('prepends Happy append system prompt before the first Codex user message', () => {
        const prompt = buildCodexTurnPrompt({
            message: 'pick an option',
            mode: {
                appendSystemPrompt: '<options><option>Yes</option></options>',
            },
            includeAppendSystemPrompt: true,
            includeTitleInstruction: true,
        });

        expect(prompt).toBe(
            '<options><option>Yes</option></options>\n\n' +
            'pick an option\n\n' +
            CHANGE_TITLE_INSTRUCTION,
        );
    });

    it('preserves the existing first-turn title instruction when no append prompt is set', () => {
        const prompt = buildCodexTurnPrompt({
            message: 'hello',
            mode: {},
            includeAppendSystemPrompt: true,
            includeTitleInstruction: true,
        });

        expect(prompt).toBe(`hello\n\n${CHANGE_TITLE_INSTRUCTION}`);
    });

    it('does not inject Happy preamble on normal follow-up turns', () => {
        const prompt = buildCodexTurnPrompt({
            message: 'continue',
            mode: {
                appendSystemPrompt: '<options><option>Yes</option></options>',
            },
            includeAppendSystemPrompt: false,
            includeTitleInstruction: false,
        });

        expect(prompt).toBe('continue');
    });

    it('can re-inject Happy append prompt without title instruction after a thread reset', () => {
        const prompt = buildCodexTurnPrompt({
            message: 'start fresh',
            mode: {
                appendSystemPrompt: '<options><option>Yes</option></options>',
            },
            includeAppendSystemPrompt: true,
            includeTitleInstruction: false,
        });

        expect(prompt).toBe(
            '<options><option>Yes</option></options>\n\n' +
            'start fresh',
        );
    });

    it('sends normal -> voice -> normal with voice instructions scoped to only the voice turn', async () => {
        const prompts: string[] = [];
        const sender = {
            sendTurnAndWait: async (prompt: string, _options: Record<string, never>) => {
                prompts.push(prompt);
                return { aborted: false };
            },
        };

        await sendCodexTurnWithPrompt({
            sender,
            message: 'normal before',
            mode: { appendSystemPrompt: 'persistent Happy instructions' },
            includeAppendSystemPrompt: true,
            includeTitleInstruction: false,
            turnOptions: {},
        });
        await sendCodexTurnWithPrompt({
            sender,
            message: 'voice request',
            mode: { appendSystemPrompt: 'persistent Happy instructions', voiceMode: true },
            includeAppendSystemPrompt: false,
            includeTitleInstruction: false,
            turnOptions: {},
        });
        await sendCodexTurnWithPrompt({
            sender,
            message: 'normal after',
            mode: { appendSystemPrompt: 'persistent Happy instructions' },
            includeAppendSystemPrompt: false,
            includeTitleInstruction: false,
            turnOptions: {},
        });

        expect(prompts).toEqual([
            'persistent Happy instructions\n\nnormal before',
            `${VOICE_MODE_APPEND_SYSTEM_PROMPT}\n\nvoice request`,
            'normal after',
        ]);
    });

    it('sends voice instructions after resume even when the persistent append prompt is already injected', async () => {
        const prompts: string[] = [];
        const sender = {
            sendTurnAndWait: async (prompt: string, _options: Record<string, never>) => {
                prompts.push(prompt);
                return { aborted: false };
            },
        };

        await sendCodexTurnWithPrompt({
            sender,
            message: 'voice after resume',
            mode: { appendSystemPrompt: 'already present in thread', voiceMode: true },
            includeAppendSystemPrompt: false,
            includeTitleInstruction: false,
            turnOptions: {},
        });

        expect(prompts).toEqual([
            `${VOICE_MODE_APPEND_SYSTEM_PROMPT}\n\nvoice after resume`,
        ]);
    });
});

describe('hashCodexEnhancedMode', () => {
    it('separates queued Codex messages with different append system prompts', () => {
        const baseMode: CodexEnhancedMode = {
            permissionMode: 'default',
            model: 'gpt-5.5',
            effort: 'medium',
        };

        expect(hashCodexEnhancedMode({
            ...baseMode,
            appendSystemPrompt: 'options A',
        })).not.toBe(hashCodexEnhancedMode({
            ...baseMode,
            appendSystemPrompt: 'options B',
        }));
    });

    it('separates normal and voice Codex queue modes', () => {
        const baseMode: CodexEnhancedMode = { permissionMode: 'default' };

        expect(hashCodexEnhancedMode(baseMode)).not.toBe(hashCodexEnhancedMode({
            ...baseMode,
            voiceMode: true,
        }));
    });
});
