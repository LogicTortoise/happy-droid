import { Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { requestMicrophonePermission, showMicrophonePermissionDeniedAlert } from '@/utils/microphonePermissions';
import { ANDROID_RECOGNIZER_ACTION, ANDROID_RECOGNIZER_RESULTS, extractSpeechRecognitionText } from './voiceMode';

const EXTRA_LANGUAGE_MODEL = 'android.speech.extra.LANGUAGE_MODEL';
const EXTRA_LANGUAGE_MODEL_FREE_FORM = 'free_form';
const EXTRA_PROMPT = 'android.speech.extra.PROMPT';
const EXTRA_PARTIAL_RESULTS = 'android.speech.extra.PARTIAL_RESULTS';

export async function requestAndroidSpeechRecognition(prompt: string = 'Speak now'): Promise<string | null> {
    if (Platform.OS !== 'android') {
        return null;
    }

    const permission = await requestMicrophonePermission();
    if (!permission.granted) {
        showMicrophonePermissionDeniedAlert(permission.canAskAgain);
        return null;
    }

    const result = await IntentLauncher.startActivityAsync(ANDROID_RECOGNIZER_ACTION, {
        extra: {
            [EXTRA_LANGUAGE_MODEL]: EXTRA_LANGUAGE_MODEL_FREE_FORM,
            [EXTRA_PROMPT]: prompt,
            [EXTRA_PARTIAL_RESULTS]: false,
        },
    });

    if (result.resultCode !== IntentLauncher.ResultCode.Success) {
        return null;
    }

    return extractSpeechRecognitionText({
        [ANDROID_RECOGNIZER_RESULTS]: (result.extra as Record<string, unknown> | undefined)?.[ANDROID_RECOGNIZER_RESULTS],
        ...(result.extra && typeof result.extra === 'object' ? result.extra : {}),
    });
}
