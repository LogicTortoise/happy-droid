# happy-droid Changelog

## 2026-07-04 - Server URL Chain Validation

- Started P0 validation for `EXPO_PUBLIC_HAPPY_SERVER_URL` and `serverConfig` backend URL resolution.
- Pre-read gap remains: `SUPERVISOR_TASK.md` and `.supervisor/outline.md` are absent in this checkout.
- Planned coverage: persisted custom URL precedence, global config fallback, Expo env fallback, default fallback, URL validation, server info parsing, and log server URL persistence.

## 2026-07-04 - Arbitrary File Attachment Upload

- Started P0 work to extend the existing image attachment upload path into generic file/document upload.
- Pre-read gap remains: `SUPERVISOR_TASK.md` and `.supervisor/outline.md` are absent in this checkout.
- Planned coverage: file/document picker state, generic attachment metadata, upload-to-file-event payloads, image metadata preservation, and unsupported-agent send gating.
- Follow-up AI review requires end-to-end mimeType propagation into CLI Claude/Codex consumers and restoring the original mobile image picker path.
- Follow-up AI review requires real document content handoff for common text/PDF/Office attachments, canonical happy-wire schema alignment, generic attachment i18n, and attachment-only send icon state.
- Follow-up validation requires CLI session protocol tests to match the canonical file event schema: full image metadata is valid, missing dimensions are invalid.

## 2026-07-04 - Session Input Attachment Picker UI

- Started P0 validation for the Session input area exposing separate ImagePicker and DocumentPicker actions with a pending attachment preview strip.
- Pre-read gap remains: `SUPERVISOR_TASK.md` and `.supervisor/outline.md` are absent in this checkout.
- Planned coverage: image picker metadata/thumbhash preservation, document picker generic attachment state, composer wiring, attachment-only send behavior, happy-app typecheck, focused attachment tests, and quick validation.
- AI review follow-up requires implementation-bearing changes in the current task range, including composer attachment wiring tests, pending attachment strip coverage, and generic attachment naming at the UI boundary.

## 2026-07-04 - Agent Artifact/File Reference Downloads

- Started P0 work to parse agent-produced artifact/file references and save referenced files locally from happy-app.
- Pre-read gap remains: `SUPERVISOR_TASK.md` and `.supervisor/outline.md` are absent in this checkout.
- Planned coverage: supported ref shape discovery, attachment/file download URL resolution, local save target handling, error reporting, happy-app typecheck, focused unit tests, quick validation, and Android APK environment check.
- AI review follow-up requires production integration: render parsed agent/tool refs in the message UI, call download/save on user action, use `sync.fetchArtifactWithBody` for artifact refs, and show saved URI or error state.

## 2026-07-10 - Downloaded Image Preview Experience

- Started P0 work to improve downloaded agent file refs with image thumbnails and full-screen preview.
- Pre-read gap remains: `SUPERVISOR_TASK.md` and `.supervisor/outline.md` are absent in this checkout.
- Planned coverage: image MIME detection, saved image thumbnail rendering, full-screen preview open/close, non-image fallback row behavior, component integration tests, happy-app typecheck, quick/app validation, and Android APK environment check.
- Implemented saved image detection for downloaded agent refs, thumbnail rendering, full-screen preview open/close, and component integration coverage while preserving non-image save rows.

## 2026-07-10 - Android Build and E2E Record Loop

- Started P0 work to close the Android build and end-to-end validation record loop.
- Pre-read gap remains: `SUPERVISOR_TASK.md` and `.supervisor/outline.md` are absent in this checkout.
- Planned coverage: reusable Android/E2E record command, Java/Gradle environment capture, quick/app/android command result capture, APK artifact metadata recording, report append behavior, focused script tests, typecheck, quick/app validation, and Android build attempt.
- Added `scripts/happy-droid-e2e-record.cjs`, dry-run tests, validation-helper integration, and validation docs so Android build attempts append command outcomes plus APK artifact state to `docs/happy-droid/e2e-report.md`.

## 2026-07-10 - App-Created Session Submission Recovery

- Started P1 work to harden happy-app-created session submission and failure recovery.
- Pre-read gap remains: `SUPERVISOR_TASK.md` and `.supervisor/outline.md` are absent in this checkout.
- Planned coverage: new-session creation flow, optimistic/local session state, outbound message submission retry semantics, failure surfacing, recovery actions, focused reducer/sync tests, happy-app typecheck, quick/app validation, and Android build/e2e record attempt.
- Added persisted pending initial-message recovery for app-created sessions, retry/discard handling, outbox commit waiting/cancelation, send failure return semantics, and focused recovery tests.
- AI review follow-up requires stable first-message localId persistence, committed-message lookup before retry/timeout recovery, idempotent retry behavior, and i18n coverage for new recovery prompts.

## 2026-07-10 - Telegram-Aligned Custom Instructions

- Started P1 work to align happy-app custom instruction sending/rendering with the read-only happy-telegram bridge behavior.
- Pre-read gap remains: `SUPERVISOR_TASK.md` and `.supervisor/outline.md` are absent in this checkout.
- Read-only reference: `/Users/Hht/Documents/10.github/happy-telegram` uses appended instructions to require button-style user questions, with Telegram rendering handled by `ask_user_question`; happy-app will align on the supported native `AskUserQuestion` path and existing app tool rendering rather than Telegram-only MCP tools.
- Planned coverage: app append-system-prompt contents, send metadata propagation, AskUserQuestion input compatibility, focused prompt/render tests, happy-app typecheck, quick/app validation, and Android build environment record if needed.

## 2026-07-10 - Local Voice Mode

- Started P1 work to land local voice mode in happy-app without the remote ElevenLabs conversation path.
- Pre-read gap remains: `SUPERVISOR_TASK.md` and `.supervisor/outline.md` are absent in this checkout.
- Planned coverage: Android STT input entry, local TTS reading of agent replies, `voiceMode` message metadata through app/wire/CLI schemas, concise generation prompt handling, focused unit tests, happy-app typecheck, quick/app validation, and Android build environment record.
- Implemented Android speech-recognition input on the Session mic button, local TTS playback for agent replies after voice prompts, `voiceMode` metadata across app/wire/CLI schemas, and per-turn concise spoken-response prompt handling for Claude/Codex.
- Validation: focused app/wire/CLI tests, happy-app typecheck, and quick/app validation groups passed; initial Android attempts exposed Java 8 and release packaging memory failures, both retained in `docs/happy-droid/e2e-report.md`.
- E2E fix: validation/report helpers now select an already-installed JDK 17+ for Android subprocesses and pass reproducible 6 GiB heap/1 GiB metaspace limits to Gradle without changing host Java or ignored native-project settings.
- Final E2E: the full quick/app/android recorder exited 0, all 729 happy-app tests passed, and both debug and release APK builds passed.
- Android service follow-up: replace the unresolvable speech Activity path with native recognition-service capability checks, add a bounded offline-model download flow, gate local TTS on installed voices, surface localized missing-service errors, and rerun the logged-in STT-to-message-to-TTS device flow.
- AI review follow-up: align `voiceMode` across every supported runner, correlate TTS to the originating user `localId` and completed protocol turn, select a locale-matched TTS voice, and synchronize the voice/wire specifications.
- AI review follow-up: Gemini still needs protocol turn lifecycle output, Gemini/OpenClaw/ACP must isolate voice messages from adjacent queued input, and the Android offline-model dialog result must not be reported as ready.
- Implemented Gemini protocol lifecycle output, stable voice-turn `localKey` correlation, isolated Gemini/OpenClaw/ACP voice queue items, and distinct Android model-dialog guidance with cross-runner integration coverage.
- E2E baseline follow-up: pin the Ink-compatible `signal-exit` major for happy-cli unit tests and ignore supervisor worker stream logs so verification starts from a clean worktree.
- AI review retry: preserve every pending App voice request independently when normal or later voice input arrives, and isolate Claude/Codex voice queue items so each `localId` maps to exactly one protocol/provider turn.
- Final review follow-up: scope Codex voice instructions to each `sendTurnAndWait`, require exact `turn-start.userLocalId` correlation with no legacy fallback, and move cancellable Android STT/TTS lifecycle ownership into a dedicated hook.
