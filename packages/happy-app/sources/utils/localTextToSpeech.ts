import * as Speech from "expo-speech";

type SpeakCallbacks = {
    onDone?: () => void;
    onStopped?: () => void;
    onError?: (error: Error) => void;
};

export type LocalTextToSpeechCapability =
    | { available: true; voiceCount: number; voice: LocalTextToSpeechVoice }
    | { available: false; reason: "no-voices" | "language-unavailable" | "timeout" | "error" };

export type LocalTextToSpeechVoice = {
    identifier: string;
    language: string;
    name?: string;
};

export type LocalTextToSpeechAdapter = {
    getAvailableVoicesAsync(): Promise<LocalTextToSpeechVoice[]>;
    stop(): Promise<void>;
    speak(text: string, options: {
        rate: number;
        pitch: number;
        language: string;
        voice: string;
        onDone?: () => void;
        onStopped?: () => void;
        onError?: (error: Error) => void;
    }): void;
};

const DEFAULT_CAPABILITY_TIMEOUT_MS = 3_000;

export async function stopLocalVoiceSpeech(): Promise<void> {
    await Speech.stop();
}

export async function getLocalTextToSpeechCapability(
    adapter: LocalTextToSpeechAdapter = Speech,
    timeoutMs = DEFAULT_CAPABILITY_TIMEOUT_MS,
    locale?: string,
): Promise<LocalTextToSpeechCapability> {
    try {
        const voices = await withTimeout(adapter.getAvailableVoicesAsync(), timeoutMs);
        if (voices.length === 0) {
            return { available: false, reason: "no-voices" };
        }
        const voice = selectLocalTextToSpeechVoice(voices, locale);
        return voice
            ? { available: true, voiceCount: voices.length, voice }
            : { available: false, reason: "language-unavailable" };
    } catch (error) {
        return {
            available: false,
            reason: error instanceof CapabilityTimeoutError ? "timeout" : "error",
        };
    }
}

export async function speakLocalVoiceReply(
    text: string,
    callbacks: SpeakCallbacks = {},
    options: {
        adapter?: LocalTextToSpeechAdapter;
        capabilityTimeoutMs?: number;
        locale?: string;
    } = {},
): Promise<LocalTextToSpeechCapability> {
    const adapter = options.adapter ?? Speech;
    const capability = await getLocalTextToSpeechCapability(
        adapter,
        options.capabilityTimeoutMs ?? DEFAULT_CAPABILITY_TIMEOUT_MS,
        options.locale,
    );
    if (!capability.available) {
        return capability;
    }

    try {
        await adapter.stop();
        adapter.speak(text, {
            rate: 1,
            pitch: 1,
            language: capability.voice.language,
            voice: capability.voice.identifier,
            onDone: callbacks.onDone,
            onStopped: callbacks.onStopped,
            onError: callbacks.onError,
        });
        return capability;
    } catch {
        return { available: false, reason: "error" };
    }
}

export function selectLocalTextToSpeechVoice(
    voices: LocalTextToSpeechVoice[],
    locale?: string,
): LocalTextToSpeechVoice | null {
    if (voices.length === 0) {
        return null;
    }
    if (!locale) {
        return voices[0];
    }

    const normalizedLocale = normalizeLocale(locale);
    const exact = voices.find((voice) => normalizeLocale(voice.language) === normalizedLocale);
    if (exact) {
        return exact;
    }

    const baseLanguage = normalizedLocale.split("-")[0];
    return voices.find((voice) => normalizeLocale(voice.language).split("-")[0] === baseLanguage) ?? null;
}

function normalizeLocale(locale: string): string {
    return locale.replace(/_/g, "-").toLowerCase();
}

class CapabilityTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new CapabilityTimeoutError()), timeoutMs);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}
