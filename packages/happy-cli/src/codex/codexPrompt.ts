import type { PermissionMode } from '@/api/types';
import { CHANGE_TITLE_INSTRUCTION } from '@/gemini/constants';
import { hashObject } from '@/utils/deterministicJson';
import { VOICE_MODE_APPEND_SYSTEM_PROMPT } from '@/utils/voiceModePrompt';

import type { ReasoningEffort } from './codexAppServerTypes';

export interface CodexEnhancedMode {
    permissionMode: PermissionMode;
    model?: string;
    /** Happy app instructions appended to the first Codex prompt for option chips. */
    appendSystemPrompt?: string;
    /** Reasoning effort passed through to Codex's sendTurnAndWait. */
    effort?: ReasoningEffort;
    /** Correlates an isolated app voice prompt with its protocol turn. */
    voiceLocalId?: string;
    /** Applies concise spoken-response instructions to this turn only. */
    voiceMode?: boolean;
}

export function hashCodexEnhancedMode(mode: CodexEnhancedMode): string {
    return hashObject({
        permissionMode: mode.permissionMode,
        model: mode.model,
        appendSystemPrompt: mode.appendSystemPrompt,
        effort: mode.effort,
        voiceMode: mode.voiceMode,
    });
}

export function buildCodexTurnPrompt(opts: {
    message: string;
    mode: Pick<CodexEnhancedMode, 'appendSystemPrompt' | 'voiceMode'>;
    includeAppendSystemPrompt: boolean;
    includeTitleInstruction: boolean;
}): string {
    const parts: string[] = [];

    if (opts.includeAppendSystemPrompt && opts.mode.appendSystemPrompt) {
        parts.push(opts.mode.appendSystemPrompt);
    }

    if (opts.mode.voiceMode) {
        parts.push(VOICE_MODE_APPEND_SYSTEM_PROMPT);
    }

    parts.push(opts.message);

    if (opts.includeTitleInstruction) {
        parts.push(CHANGE_TITLE_INSTRUCTION);
    }

    return parts.join('\n\n');
}

export async function sendCodexTurnWithPrompt<TOptions, TResult>(opts: {
    sender: { sendTurnAndWait(prompt: string, options: TOptions): Promise<TResult> };
    message: string;
    mode: Pick<CodexEnhancedMode, 'appendSystemPrompt' | 'voiceMode'>;
    includeAppendSystemPrompt: boolean;
    includeTitleInstruction: boolean;
    turnOptions: TOptions;
}): Promise<TResult> {
    const prompt = buildCodexTurnPrompt({
        message: opts.message,
        mode: opts.mode,
        includeAppendSystemPrompt: opts.includeAppendSystemPrompt,
        includeTitleInstruction: opts.includeTitleInstruction,
    });
    return await opts.sender.sendTurnAndWait(prompt, opts.turnOptions);
}
