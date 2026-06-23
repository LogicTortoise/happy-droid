export const ANDROID_RECOGNIZER_ACTION = 'android.speech.action.RECOGNIZE_SPEECH';
export const ANDROID_RECOGNIZER_RESULTS = 'android.speech.extra.RESULTS';

const MAX_SPEECH_TEXT_LENGTH = 1200;

export function sanitizeTextForSpeech(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^>\s?/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_SPEECH_TEXT_LENGTH);
}

export function extractSpeechRecognitionText(extra: unknown): string | null {
    if (!extra || typeof extra !== 'object') {
        return null;
    }

    const record = extra as Record<string, unknown>;
    const candidates = [
        record[ANDROID_RECOGNIZER_RESULTS],
        record.results,
        record.results_recognition,
    ];

    for (const candidate of candidates) {
        if (Array.isArray(candidate)) {
            const first = candidate.find((value) => typeof value === 'string' && value.trim().length > 0);
            if (typeof first === 'string') {
                return first.trim();
            }
        }
        if (typeof candidate === 'string' && candidate.trim().length > 0) {
            return candidate.trim();
        }
    }

    return null;
}
