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
