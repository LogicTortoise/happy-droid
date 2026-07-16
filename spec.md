# Happy Droid Product Specification

This file records happy-droid capabilities that differ from upstream Happy. It is subordinate to `SUPERVISOR_TASK.md` when that file is present; the current checkout does not contain that file.

## Local Android Voice Mode

**Capability:** A Session can accept local Android speech input, request a concise spoken response from every supported agent runner, and read the corresponding reply aloud with an appropriate installed voice.

**Acceptance criteria:**

- Speech input is sent with public voice-mode metadata and remains usable as normal message text.
- Every supported agent runner applies concise spoken-response behavior only to the corresponding voice input.
- Each voice input maps to one distinct agent turn; ordinary and other voice inputs remain separate.
- A reply is spoken only when its completed protocol turn exactly identifies the originating voice message; missing correlation remains silent.
- The selected TTS voice matches the recognized or configured locale and never silently uses an unrelated language.
- Missing speech services, unavailable languages, and playback failures produce localized guidance while preserving text input and readable replies.
- Active recognition can be cancelled, and leaving the Session stops local recognition and playback.

## Wire Contract

**Capability:** `MessageMeta.voiceMode?: boolean` requests a concise, speech-friendly response without changing the displayed transcript.

**Acceptance criteria:** Producers set the field for local voice input, every supported runner honors it for that isolated input turn, and protocol output preserves the originating message identity through turn completion.
