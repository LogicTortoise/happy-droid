/**
 * Owns the local Android STT -> Session turn -> correlated TTS lifecycle.
 *
 * The hook keeps recognition cancellation, FIFO voice requests, strict protocol
 * correlation, serialized playback, and unmount cleanup out of SessionView.
 */
import * as React from 'react';

import { Modal } from '@/modal';
import { sync, type SendMessageResult } from '@/sync/sync';
import type { Message } from '@/sync/typesMessage';
import { t } from '@/text';
import { tracking } from '@/track';
import {
    downloadAndroidSpeechRecognitionModel,
    startAndroidSpeechRecognition,
    type AndroidSpeechRecognitionSession,
} from '@/utils/androidSpeechRecognition';
import {
    enqueueLocalVoiceRequest,
    removeLocalVoiceRequest,
    resolveLocalVoiceTurnReply,
    type LocalVoiceRequest,
} from '@/utils/localVoiceMode';
import { speakLocalVoiceReply, stopLocalVoiceSpeech } from '@/utils/localTextToSpeech';

type VoiceSendOptions = {
    source: 'voice';
    displayText: string;
    voiceMode: true;
};

export type LocalAndroidVoiceModeDependencies = {
    startRecognition(): AndroidSpeechRecognitionSession;
    downloadRecognitionModel: typeof downloadAndroidSpeechRecognitionModel;
    sendMessage(sessionId: string, text: string, options: VoiceSendOptions): Promise<SendMessageResult>;
    speakReply: typeof speakLocalVoiceReply;
    stopSpeaking: typeof stopLocalVoiceSpeech;
};

type UseLocalAndroidVoiceModeOptions = {
    enabled: boolean;
    sessionId: string;
    messages: Message[];
    clearComposerMessage(): void;
    dependencies?: Partial<LocalAndroidVoiceModeDependencies>;
};

type UseLocalAndroidVoiceModeResult = {
    isListening: boolean;
    isSpeaking: boolean;
    onMicrophonePress(): Promise<void>;
};

const DEFAULT_DEPENDENCIES: LocalAndroidVoiceModeDependencies = {
    startRecognition: () => startAndroidSpeechRecognition(),
    downloadRecognitionModel: downloadAndroidSpeechRecognitionModel,
    sendMessage: (sessionId, text, options) => sync.sendMessage(sessionId, text, options),
    speakReply: speakLocalVoiceReply,
    stopSpeaking: stopLocalVoiceSpeech,
};

export function useLocalAndroidVoiceMode({
    enabled,
    sessionId,
    messages,
    clearComposerMessage,
    dependencies,
}: UseLocalAndroidVoiceModeOptions): UseLocalAndroidVoiceModeResult {
    const startRecognition = dependencies?.startRecognition ?? DEFAULT_DEPENDENCIES.startRecognition;
    const downloadRecognitionModel = dependencies?.downloadRecognitionModel ?? DEFAULT_DEPENDENCIES.downloadRecognitionModel;
    const sendMessage = dependencies?.sendMessage ?? DEFAULT_DEPENDENCIES.sendMessage;
    const speakReply = dependencies?.speakReply ?? DEFAULT_DEPENDENCIES.speakReply;
    const stopSpeaking = dependencies?.stopSpeaking ?? DEFAULT_DEPENDENCIES.stopSpeaking;

    const [isListening, setIsListening] = React.useState(false);
    const [isSpeaking, setIsSpeaking] = React.useState(false);
    const [requests, setRequests] = React.useState<LocalVoiceRequest[]>([]);
    const mountedRef = React.useRef(true);
    const listeningRef = React.useRef(false);
    const speakingRef = React.useRef(false);
    const recognitionRef = React.useRef<AndroidSpeechRecognitionSession | null>(null);
    const activeRequestRef = React.useRef<string | null>(null);
    const ttsUnavailableShownRef = React.useRef(false);

    const updateListening = React.useCallback((value: boolean) => {
        listeningRef.current = value;
        if (mountedRef.current) {
            setIsListening(value);
        }
    }, []);

    const updateSpeaking = React.useCallback((value: boolean) => {
        speakingRef.current = value;
        if (mountedRef.current) {
            setIsSpeaking(value);
        }
    }, []);

    const onMicrophonePress = React.useCallback(async () => {
        if (!enabled) {
            return;
        }
        if (listeningRef.current) {
            recognitionRef.current?.cancel();
            updateListening(false);
            return;
        }
        if (speakingRef.current) {
            try {
                await stopSpeaking();
            } catch (error) {
                console.error('Failed to stop local voice reply:', error);
                Modal.alert(t('errors.voiceServiceUnavailable'), t('errors.localTextToSpeechUnavailable'));
            }
            return;
        }

        updateListening(true);
        const recognition = startRecognition();
        recognitionRef.current = recognition;
        try {
            const outcome = await recognition.result;
            if (!mountedRef.current || outcome.status === 'cancelled') {
                return;
            }
            if (outcome.status === 'model-download-required') {
                const shouldDownload = await Modal.confirm(
                    t('errors.voiceServiceUnavailable'),
                    t('errors.localSpeechRecognitionModelRequired'),
                    {
                        cancelText: t('common.cancel'),
                        confirmText: t('common.continue'),
                    },
                );
                if (!shouldDownload || !mountedRef.current) {
                    return;
                }
                const download = await downloadRecognitionModel(outcome.locale);
                if (!mountedRef.current) {
                    return;
                }
                if (download.status === 'error') {
                    console.error('[LocalVoice] Android speech model download failed', download);
                    Modal.alert(t('errors.voiceSessionFailed'), t('errors.localSpeechRecognitionModelDownloadFailed'));
                    return;
                }
                if (download.status === 'opened-dialog') {
                    Modal.alert(t('errors.voiceServiceUnavailable'), t('errors.localSpeechRecognitionModelDialogOpened'));
                    return;
                }
                Modal.alert(t('common.success'), t('errors.localSpeechRecognitionModelReady'));
                return;
            }
            if (outcome.status === 'unavailable') {
                console.warn('[LocalVoice] Android speech recognition unavailable', outcome.capability);
                Modal.alert(t('errors.voiceServiceUnavailable'), t('errors.localSpeechRecognitionUnavailable'));
                return;
            }
            if (outcome.status === 'permission-denied') {
                console.warn('[LocalVoice] Android microphone permission denied', {
                    canAskAgain: outcome.canAskAgain,
                });
                Modal.alert(t('errors.voiceSessionFailed'), t('errors.localSpeechRecognitionPermissionDenied'));
                return;
            }
            if (outcome.status === 'error') {
                console.error('[LocalVoice] Android speech recognition failed', outcome);
                Modal.alert(t('errors.voiceSessionFailed'), t('errors.localSpeechRecognitionFailed'));
                return;
            }

            clearComposerMessage();
            ttsUnavailableShownRef.current = false;
            const sendResult = await sendMessage(sessionId, outcome.transcript, {
                source: 'voice',
                displayText: outcome.transcript,
                voiceMode: true,
            });
            if (!sendResult.queued || !sendResult.localId) {
                throw new Error('Voice message was not queued');
            }
            if (!mountedRef.current) {
                return;
            }
            const localId = sendResult.localId;
            setRequests((current) => enqueueLocalVoiceRequest(current, {
                localId,
                locale: outcome.locale,
            }));
            console.info('[LocalVoice] Android voice message queued', {
                sessionId,
                localId: sendResult.localId,
                service: outcome.service,
                transcriptLength: outcome.transcript.length,
                voiceMode: true,
            });
        } catch (error) {
            if (!mountedRef.current) {
                return;
            }
            console.error('Failed to capture local voice input:', error);
            Modal.alert(t('common.error'), t('errors.voiceSessionFailed'));
            tracking?.capture('voice_session_error', {
                session_id: sessionId,
                error: error instanceof Error ? error.message : 'Unknown error',
                mode: 'local_android_stt',
            });
        } finally {
            if (recognitionRef.current === recognition) {
                recognitionRef.current = null;
                updateListening(false);
            }
        }
    }, [
        clearComposerMessage,
        downloadRecognitionModel,
        enabled,
        sendMessage,
        sessionId,
        startRecognition,
        stopSpeaking,
        updateListening,
    ]);

    React.useEffect(() => {
        if (!enabled || listeningRef.current || activeRequestRef.current) {
            return;
        }
        const request = requests[0];
        if (!request) {
            return;
        }
        const resolution = resolveLocalVoiceTurnReply(messages, request.localId);
        if (resolution.status === 'waiting') {
            return;
        }

        const finishRequest = () => {
            if (activeRequestRef.current !== request.localId) {
                return;
            }
            activeRequestRef.current = null;
            updateSpeaking(false);
            if (mountedRef.current) {
                setRequests((current) => removeLocalVoiceRequest(current, request.localId));
            }
        };

        if (!resolution.text) {
            console.info('[LocalVoice] Voice turn ended without a speakable reply', {
                turnId: resolution.turnId,
                status: resolution.turnStatus,
            });
            setRequests((current) => removeLocalVoiceRequest(current, request.localId));
            return;
        }

        const showTextToSpeechUnavailable = () => {
            finishRequest();
            if (!ttsUnavailableShownRef.current && mountedRef.current) {
                ttsUnavailableShownRef.current = true;
                Modal.alert(t('errors.voiceServiceUnavailable'), t('errors.localTextToSpeechUnavailable'));
            }
        };

        activeRequestRef.current = request.localId;
        updateSpeaking(true);
        void speakReply(resolution.text, {
            onDone: finishRequest,
            onStopped: finishRequest,
            onError: (error) => {
                console.error('Failed to speak local voice reply:', error);
                showTextToSpeechUnavailable();
            },
        }, { locale: request.locale }).then((capability) => {
            if (!capability.available) {
                console.warn('[LocalVoice] Android text-to-speech unavailable', capability);
                showTextToSpeechUnavailable();
                return;
            }
            console.info('[LocalVoice] Android text-to-speech started', {
                turnId: resolution.turnId,
                voiceCount: capability.voiceCount,
                voice: capability.voice.identifier,
                language: capability.voice.language,
            });
        }).catch((error) => {
            console.error('Failed to start local voice reply:', error);
            showTextToSpeechUnavailable();
        });
    }, [enabled, messages, requests, speakReply, updateSpeaking]);

    React.useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            recognitionRef.current?.cancel();
            recognitionRef.current = null;
            activeRequestRef.current = null;
            void stopSpeaking().catch((error) => {
                console.warn('[LocalVoice] Failed to stop speech during unmount', error);
            });
        };
    }, [stopSpeaking]);

    return { isListening, isSpeaking, onMicrophonePress };
}
