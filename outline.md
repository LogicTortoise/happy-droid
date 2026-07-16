# Happy Droid Architecture

This document is the architecture source of truth for happy-droid-specific behavior in the Happy monorepo.

## Scope

happy-droid adapts `packages/happy-app` as a self-hosted Android client while preserving the existing Happy backend and encrypted Session protocol. The fork owns App, shared wire-contract, CLI runner integration, validation, and documentation changes. External `/happy` and `/happy-telegram` checkouts are read-only references.

## Module Boundaries

- `packages/happy-app`: Expo/React Native client and Session composer; a dedicated local Android voice hook owns cancellable STT, FIFO request state, exact turn correlation, serialized TTS, and unmount cleanup.
- `packages/happy-wire`: canonical public message metadata and Session protocol schemas shared by producers and consumers.
- `packages/happy-cli`: Claude, Codex, Gemini, OpenClaw, and ACP runner queues; concise voice prompting; protocol turn lifecycle emission.
- `scripts/happy-droid-*.cjs`: reproducible pnpm, typecheck, test, Java selection, Android build, and E2E evidence recording.
- `docs/happy-droid`: task changelog and executable verification evidence.

## Local Voice Data Flow

```text
Session microphone
  -> Android speech capability and permission preflight
  -> recognized text plus locale
  -> encrypted Session message with stable localId and voiceMode=true
  -> isolated CLI runner queue item
  -> concise provider prompt for that item only
  -> turn-start(userLocalId), agent text, terminal turn-end
  -> App reducer and FIFO local voice request resolver
  -> locale-matched installed TTS voice
  -> serialized playback of the matched completed reply
```

The stable App message `localId` is carried as the existing wire `localKey` and becomes `turn-start.userLocalId`. The App requires an exact identity match and never guesses an unassociated turn; missing correlation remains pending and cannot trigger TTS. Every supported runner isolates voice items from adjacent normal and voice items, so queue batching cannot leak concise prompting or unrelated output into a spoken reply. Codex keeps persistent Happy instructions separate from a current-turn-only voice instruction passed to each applicable provider turn.

## Failure Boundaries

STT and TTS availability are runtime device capabilities. Missing recognizers, language models, voices, or playback services produce localized guidance while the typed-message and readable-reply paths remain available. Opening a system model-download dialog is not treated as successful model installation.

## Key Dependencies

- `expo-speech-recognition` provides native Android recognizer discovery, permissions, locale model handling, and recognition events.
- `expo-speech` provides installed voice discovery and local playback.
- `@slopus/happy-wire` defines `MessageMeta.voiceMode` and protocol turn correlation fields.

## Verification Boundary

Static and deterministic gates cover App/wire/CLI typechecks, per-runner voice isolation, protocol normalization/reduction, locale selection, failure fallback, and Android APK builds. Acoustic STT/TTS validation additionally requires an Android target with a working microphone backend, SpeechRecognizer service, language model, and TTS engine.
