import { describe, expect, it } from 'vitest';

import {
  appendVoiceModePrompt,
  enqueueVoiceModePrompt,
  prependVoiceModePromptToUserMessage,
  resolveVoiceModePromptForRunner,
  type VoiceModeRunner,
  VOICE_MODE_APPEND_SYSTEM_PROMPT,
} from './voiceModePrompt';
import { MessageQueue2 } from './MessageQueue2';

describe('appendVoiceModePrompt', () => {
  it('adds spoken-response instructions to an existing append prompt', () => {
    const prompt = appendVoiceModePrompt('button instructions');

    expect(prompt).toContain('button instructions');
    expect(prompt).toContain(VOICE_MODE_APPEND_SYSTEM_PROMPT);
    expect(prompt).toContain('text-to-speech');
    expect(prompt).toContain('concise');
  });

  it('can be used as the only append prompt for voice-mode turns', () => {
    expect(appendVoiceModePrompt(undefined)).toBe(VOICE_MODE_APPEND_SYSTEM_PROMPT);
  });

  it.each(['gemini', 'openclaw', 'acp'])('prepends the shared prompt for %s user turns', () => {
    const prompt = prependVoiceModePromptToUserMessage('What changed?', true);

    expect(prompt).toBe(`${VOICE_MODE_APPEND_SYSTEM_PROMPT}\n\nWhat changed?`);
  });

  it('leaves non-voice user turns unchanged', () => {
    expect(prependVoiceModePromptToUserMessage('Keep formatting', false)).toBe('Keep formatting');
  });

  it.each([
    ['claude', 'system'],
    ['codex', 'message'],
    ['gemini', 'message'],
    ['openclaw', 'message'],
    ['acp', 'message'],
  ] as const)('applies voice mode for the %s runner through the %s channel', (runner, channel) => {
    const resolved = resolveVoiceModePromptForRunner({
      runner: runner as VoiceModeRunner,
      message: 'Summarize the build',
      appendSystemPrompt: 'Existing instructions',
      voiceMode: true,
    });

    if (channel === 'system') {
      expect(resolved.message).toBe('Summarize the build');
      expect(resolved.appendSystemPrompt).toContain(VOICE_MODE_APPEND_SYSTEM_PROMPT);
    } else {
      expect(resolved.message).toContain(VOICE_MODE_APPEND_SYSTEM_PROMPT);
      expect(resolved.appendSystemPrompt).toBe('Existing instructions');
    }
  });

  it.each(['gemini', 'openclaw', 'acp'] as const)(
    'keeps normal -> voice -> normal input in separate %s provider turns',
    async (runner) => {
      const queue = new MessageQueue2<{ runner: VoiceModeRunner }>((mode) => mode.runner);
      const enqueue = (message: string, voiceMode: boolean) => {
        const resolved = resolveVoiceModePromptForRunner({ runner, message, voiceMode });
        enqueueVoiceModePrompt({
          queue,
          message: resolved.message,
          mode: { runner },
          voiceMode,
        });
      };

      enqueue('normal before', false);
      enqueue('voice request', true);
      enqueue('normal after', false);

      const first = await queue.waitForMessagesAndGetAsString();
      const voice = await queue.waitForMessagesAndGetAsString();
      const last = await queue.waitForMessagesAndGetAsString();

      expect(first).toMatchObject({ message: 'normal before', isolate: false });
      expect(voice).toMatchObject({ isolate: true });
      expect(voice?.message).toContain(VOICE_MODE_APPEND_SYSTEM_PROMPT);
      expect(voice?.message).toContain('voice request');
      expect(last).toMatchObject({ message: 'normal after', isolate: false });
      expect(first?.message).not.toContain(VOICE_MODE_APPEND_SYSTEM_PROMPT);
      expect(last?.message).not.toContain(VOICE_MODE_APPEND_SYSTEM_PROMPT);
    },
  );
});
