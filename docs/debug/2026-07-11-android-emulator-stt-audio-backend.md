# Android Emulator STT Can Fail Before App Recognition

## Symptom

The Android recognizer service is installed, microphone permission is granted, and speech recognition starts, but the App receives `no-speech` and no transcript. Automated App tests and APK builds still pass.

## Root Cause

Android Emulator 36.6.11 can fail to create its host microphone device. In the observed run, shutdown logs reported `kAudioHardwareIllegalOperationError`, `Could not initialize record`, and failure to create `virtio-snd-mic0`. The recognizer therefore received no usable audio; this was not an App STT lifecycle failure.

## Diagnosis

Confirm all three layers before changing App code:

1. `adb devices` lists the intended target.
2. Android reports an installed SpeechRecognizer and TTS engine.
3. Emulator/host audio logs show a working capture backend without CoreAudio or `virtio-snd` initialization failures.

## Resolution

Use a physical Android device or a known-working emulator microphone backend for acoustic STT-to-TTS validation. Keep deterministic capability, protocol, queue-isolation, locale-selection, and failure-path tests as the CI gate, but do not treat them as proof of acoustic input.
