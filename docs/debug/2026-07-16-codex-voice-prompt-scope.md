# Codex Voice Prompt Can Be Lost Or Persist Across Turns

## Symptom

Codex applies concise voice behavior when the first message is voice input, but a later voice message after a normal turn or resumed thread may not be concise. Conversely, starting a thread with voice input can influence later normal replies.

## Root Cause

The voice instruction was merged into Codex's persistent `appendSystemPrompt`. Sending that prompt is guarded by the thread-level `appendSystemPromptInjected` flag, so it is emitted once rather than once per voice turn. This conflated durable Happy instructions with request-scoped voice behavior.

## Diagnosis

Capture the exact prompt passed to `sendTurnAndWait` for both normal -> voice -> normal and resumed -> voice sequences. A correct trace includes the voice instruction only in each voice call, regardless of persistent prompt injection state.

## Resolution

Keep persistent append instructions and `voiceMode` as separate queue-mode fields. Build the voice instruction into the current `sendTurnAndWait` prompt with explicit current-turn scope, and test the sender boundary directly.
