import * as Speech from 'expo-speech';
import { sanitizeTextForSpeech } from './voiceMode';

export async function speakAgentReply(text: string): Promise<boolean> {
    const speechText = sanitizeTextForSpeech(text);
    if (!speechText) {
        return false;
    }

    await Speech.stop();
    Speech.speak(speechText, {
        pitch: 1,
        rate: 0.96,
    });
    return true;
}

export async function stopSpeechOutput(): Promise<void> {
    await Speech.stop();
}
