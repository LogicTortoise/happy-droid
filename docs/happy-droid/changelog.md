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
