import { trimIdent } from "@/utils/trimIdent";
import type { MessageQueue2, PendingAttachment } from "@/utils/MessageQueue2";

export const VOICE_MODE_APPEND_SYSTEM_PROMPT = trimIdent(`
  # Voice mode

  Apply these instructions only to the current user turn. The user is interacting by local speech input and will hear the answer through text-to-speech. Reply conversationally and keep the current answer concise. Prefer one to three short sentences unless more detail is explicitly requested. Avoid long lists, tables, code blocks, and excessive formatting when a brief spoken answer is enough. Do not apply these voice instructions to later turns unless they repeat them.
`);

export function appendVoiceModePrompt(appendSystemPrompt: string | undefined): string {
  return appendSystemPrompt
    ? `${appendSystemPrompt}\n\n${VOICE_MODE_APPEND_SYSTEM_PROMPT}`
    : VOICE_MODE_APPEND_SYSTEM_PROMPT;
}

export function prependVoiceModePromptToUserMessage(message: string, voiceMode: boolean | undefined): string {
  return voiceMode
    ? `${VOICE_MODE_APPEND_SYSTEM_PROMPT}\n\n${message}`
    : message;
}

export type VoiceModeRunner = 'claude' | 'codex' | 'gemini' | 'openclaw' | 'acp';

export function enqueueVoiceModePrompt<T>(options: {
  queue: Pick<MessageQueue2<T>, 'push' | 'pushIsolated'>;
  message: string;
  mode: T;
  voiceMode?: boolean;
  attachments?: PendingAttachment[];
}): void {
  if (options.voiceMode) {
    options.queue.pushIsolated(options.message, options.mode, options.attachments);
    return;
  }
  options.queue.push(options.message, options.mode, options.attachments);
}

export function resolveVoiceModePromptForRunner(options: {
  runner: VoiceModeRunner;
  message: string;
  appendSystemPrompt?: string;
  voiceMode?: boolean;
}): { message: string; appendSystemPrompt: string | undefined } {
  if (!options.voiceMode) {
    return { message: options.message, appendSystemPrompt: options.appendSystemPrompt };
  }
  if (options.runner === 'claude') {
    return {
      message: options.message,
      appendSystemPrompt: appendVoiceModePrompt(options.appendSystemPrompt),
    };
  }
  return {
    message: prependVoiceModePromptToUserMessage(options.message, true),
    appendSystemPrompt: options.appendSystemPrompt,
  };
}
