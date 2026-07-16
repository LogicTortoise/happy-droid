# Changelog

## [Unreleased]

- Added resilient local Android voice mode with cancellable STT, isolated per-turn concise prompting across all runners, strictly correlated locale-aware TTS, localized fallback, and deterministic verification.
- Aligned happy-app custom instructions with Telegram-style button questions using native AskUserQuestion rendering.
- Added stable localId confirmation and localized recovery prompts for app-created session first-message retries.
- Hardened happy-app-created session first-message submission with persisted retry/discard recovery and outbox commit checks.
- Added an Android/E2E recorder that captures validation results and APK artifact state in the happy-droid report.
- Added image thumbnails and full-screen preview for saved agent-produced downloaded image refs in happy-app.
- Added happy-app parsing, UI save actions, and local persistence for agent-produced artifact/file refs.
- Wired the happy-app Session input to generic pending attachments with separate image/file picker actions and preview-strip tests.
- Extended happy-droid attachments from images to files/documents, including MIME-aware Claude/Codex content handoff, wire schema alignment, and generic attachment UI copy.
- Added server URL configuration tests for the happy-droid backend endpoint resolution chain.
- Rebuilt the happy-droid pnpm baseline docs and added a reusable validation command inventory.
