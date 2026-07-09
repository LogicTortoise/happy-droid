import { describe, expect, it } from 'vitest';
import { systemPrompt } from './systemPrompt';

describe('happy-app custom instruction system prompt', () => {
    it('prefers native AskUserQuestion button prompts and keeps XML options fallback', () => {
        expect(systemPrompt).toContain('AskUserQuestion');
        expect(systemPrompt).toContain('questions');
        expect(systemPrompt).toContain('multiSelect');
        expect(systemPrompt).toContain('<options>');
        expect(systemPrompt).toContain('</options>');
    });

    it('tells agents not to duplicate button choices as plain text lists', () => {
        expect(systemPrompt).toContain('Do not list the same options in plain text');
        expect(systemPrompt).toContain('ask with buttons/options');
    });
});
