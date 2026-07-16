import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'en-US' }] }));
vi.mock('expo-speech', () => ({
    getAvailableVoicesAsync: vi.fn(async () => []),
    stop: vi.fn(async () => undefined),
    speak: vi.fn(),
}));
vi.mock('@/modal', () => ({
    Modal: { alert: vi.fn(), confirm: vi.fn(async () => false) },
}));
vi.mock('@/sync/sync', () => ({
    sync: { sendMessage: vi.fn() },
}));
vi.mock('@/text', () => ({ t: (key: string) => key }));
vi.mock('@/track', () => ({ tracking: null }));

import {
    useLocalAndroidVoiceMode,
    type LocalAndroidVoiceModeDependencies,
} from './useLocalAndroidVoiceMode';

type HookResult = ReturnType<typeof useLocalAndroidVoiceMode>;
type Renderer = { unmount(): void };
type TestRendererApi = {
    act(callback: () => void | Promise<void>): Promise<void>;
    create(element: React.ReactElement): Renderer;
};

const TestRenderer = require('react-test-renderer') as TestRendererApi;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function createPendingRecognition() {
    let resolve!: (value: { status: 'cancelled' }) => void;
    const result = new Promise<{ status: 'cancelled' }>((next) => {
        resolve = next;
    });
    const cancel = vi.fn(() => resolve({ status: 'cancelled' }));
    return { session: { result, cancel }, cancel };
}

async function renderVoiceHook(dependencies: Partial<LocalAndroidVoiceModeDependencies>) {
    let latest: HookResult | null = null;
    const Harness = () => {
        latest = useLocalAndroidVoiceMode({
            enabled: true,
            sessionId: 'session',
            messages: [],
            clearComposerMessage: vi.fn(),
            dependencies,
        });
        return null;
    };
    let renderer!: Renderer;
    await TestRenderer.act(async () => {
        renderer = TestRenderer.create(React.createElement(Harness));
    });
    return {
        get current(): HookResult {
            if (!latest) {
                throw new Error('Hook did not render');
            }
            return latest;
        },
        renderer,
    };
}

describe('useLocalAndroidVoiceMode', () => {
    it('cancels active recognition when the microphone is pressed again', async () => {
        const recognition = createPendingRecognition();
        const hook = await renderVoiceHook({
            startRecognition: () => recognition.session,
            stopSpeaking: vi.fn(async () => {}),
        });

        await TestRenderer.act(async () => {
            void hook.current.onMicrophonePress();
            await Promise.resolve();
        });
        expect(hook.current.isListening).toBe(true);

        await TestRenderer.act(async () => {
            await hook.current.onMicrophonePress();
            await recognition.session.result;
        });

        expect(recognition.cancel).toHaveBeenCalledTimes(1);
        expect(hook.current.isListening).toBe(false);
        await TestRenderer.act(async () => hook.renderer.unmount());
    });

    it('cancels recognition and stops TTS when the owning screen unmounts', async () => {
        const recognition = createPendingRecognition();
        const stopSpeaking = vi.fn(async () => {});
        const hook = await renderVoiceHook({
            startRecognition: () => recognition.session,
            stopSpeaking,
        });

        await TestRenderer.act(async () => {
            void hook.current.onMicrophonePress();
            await Promise.resolve();
        });
        await TestRenderer.act(async () => hook.renderer.unmount());

        expect(recognition.cancel).toHaveBeenCalledTimes(1);
        expect(stopSpeaking).toHaveBeenCalledTimes(1);
        await recognition.session.result;
    });
});
