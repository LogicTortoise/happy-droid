import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
    Platform: { OS: "android" },
}));
vi.mock("expo-localization", () => ({
    getLocales: () => [{ languageTag: "en-US" }],
}));

import {
    downloadAndroidSpeechRecognitionModel,
    getAndroidSpeechRecognitionCapability,
    recognizeAndroidSpeechAsync,
    startAndroidSpeechRecognition,
    type AndroidSpeechRecognitionModule,
} from "./androidSpeechRecognition";

type Listener = (event?: unknown) => void;

function createSpeechModule(options: {
    available?: boolean;
    services?: string[];
    defaultService?: string;
    permissionGranted?: boolean;
} = {}) {
    const listeners = new Map<string, Set<Listener>>();
    const addListener = ((event: string, listener: Listener) => {
        const current = listeners.get(event) ?? new Set<Listener>();
        current.add(listener);
        listeners.set(event, current);
        return { remove: () => current.delete(listener) };
    }) as AndroidSpeechRecognitionModule["addListener"];
    const module = {
        isRecognitionAvailable: vi.fn(() => options.available ?? true),
        getSpeechRecognitionServices: vi.fn(() => options.services ?? ["com.google.android.tts"]),
        getDefaultRecognitionService: vi.fn(() => ({
            packageName: options.defaultService ?? "com.google.android.tts",
        })),
        requestMicrophonePermissionsAsync: vi.fn(async () => ({
            granted: options.permissionGranted ?? true,
            canAskAgain: true,
        })),
        androidTriggerOfflineModelDownload: vi.fn(async () => ({
            status: "download_success" as const,
        })),
        addListener,
        start: vi.fn(),
        abort: vi.fn(),
    } as AndroidSpeechRecognitionModule;

    return {
        module,
        emit(event: string, payload?: unknown) {
            for (const listener of listeners.get(event) ?? []) {
                listener(payload);
            }
        },
    };
}

describe("Android speech recognition", () => {
    it("blocks before permission or start when no recognition service is available", async () => {
        const { module } = createSpeechModule({
            available: false,
            services: [],
            defaultService: "",
        });

        expect(getAndroidSpeechRecognitionCapability(module)).toEqual({
            available: false,
            services: [],
            defaultService: null,
            reason: "service-unavailable",
        });
        await expect(recognizeAndroidSpeechAsync({ module, platform: "android" })).resolves.toMatchObject({
            status: "unavailable",
        });
        expect(module.requestMicrophonePermissionsAsync).not.toHaveBeenCalled();
        expect(module.start).not.toHaveBeenCalled();
    });

    it("returns an explicit permission result without starting recognition", async () => {
        const { module } = createSpeechModule({ permissionGranted: false });

        await expect(recognizeAndroidSpeechAsync({ module, platform: "android" })).resolves.toEqual({
            status: "permission-denied",
            canAskAgain: true,
        });
        expect(module.start).not.toHaveBeenCalled();
    });

    it("uses the native recognition service and resolves the final transcript", async () => {
        const { module, emit } = createSpeechModule();
        const pending = recognizeAndroidSpeechAsync({
            module,
            platform: "android",
            locale: "en-US",
            timeoutMs: 1_000,
        });
        await Promise.resolve();
        await Promise.resolve();

        expect(module.start).toHaveBeenCalledWith({
            lang: "en-US",
            continuous: false,
            interimResults: false,
            maxAlternatives: 1,
            androidRecognitionServicePackage: "com.google.android.tts",
        });
        emit("result", {
            isFinal: true,
            results: [
                { transcript: "  summarize  ", confidence: 0 },
                { transcript: "  summarize the build  ", confidence: 0 },
            ],
        });

        await expect(pending).resolves.toEqual({
            status: "recognized",
            transcript: "summarize the build",
            service: "com.google.android.tts",
            locale: "en-US",
        });
    });

    it("prefers the on-device service and falls back after a retryable service failure", async () => {
        const { module, emit } = createSpeechModule({
            services: ["com.google.android.tts", "com.google.android.as"],
            defaultService: "com.google.android.tts",
        });
        const pending = recognizeAndroidSpeechAsync({
            module,
            platform: "android",
            locale: "en-US",
            timeoutMs: 1_000,
            serviceRetryDelayMs: 0,
        });
        await Promise.resolve();
        await Promise.resolve();

        expect(module.start).toHaveBeenNthCalledWith(1, {
            lang: "en-US",
            continuous: false,
            interimResults: false,
            maxAlternatives: 1,
            androidRecognitionServicePackage: "com.google.android.as",
        });
        emit("error", {
            error: "network",
            message: "On-device service could not finish",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(module.start).toHaveBeenNthCalledWith(2, {
            lang: "en-US",
            continuous: false,
            interimResults: false,
            maxAlternatives: 1,
            androidRecognitionServicePackage: "com.google.android.tts",
        });
        emit("result", {
            isFinal: true,
            results: [{ transcript: "voice fallback works" }],
        });

        await expect(pending).resolves.toEqual({
            status: "recognized",
            transcript: "voice fallback works",
            service: "com.google.android.tts",
            locale: "en-US",
        });
    });

    it("offers a model download when every service fails after a missing locale", async () => {
        const { module, emit } = createSpeechModule({
            services: ["com.google.android.as", "com.google.android.tts"],
            defaultService: "com.google.android.tts",
        });
        const pending = recognizeAndroidSpeechAsync({
            module,
            platform: "android",
            locale: "en-US",
            timeoutMs: 1_000,
            serviceRetryDelayMs: 0,
        });
        await Promise.resolve();
        await Promise.resolve();
        emit("error", {
            error: "language-not-supported",
            message: "Offline model is missing",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        emit("error", {
            error: "network",
            message: "Online recognition is unavailable",
        });

        await expect(pending).resolves.toEqual({
            status: "model-download-required",
            locale: "en-US",
        });
        await expect(downloadAndroidSpeechRecognitionModel("en-US", module)).resolves.toEqual({
            status: "ready",
        });
        expect(module.androidTriggerOfflineModelDownload).toHaveBeenCalledWith({ locale: "en-US" });
    });

    it("preserves the missing-model result when the fallback service only ends", async () => {
        const { module, emit } = createSpeechModule({
            services: ["com.google.android.as", "com.google.android.tts"],
            defaultService: "com.google.android.tts",
        });
        const pending = recognizeAndroidSpeechAsync({
            module,
            platform: "android",
            locale: "en-US",
            timeoutMs: 1_000,
            serviceRetryDelayMs: 0,
        });
        await Promise.resolve();
        await Promise.resolve();
        emit("error", {
            error: "language-not-supported",
            message: "Offline model is missing",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        emit("end");

        await expect(pending).resolves.toEqual({
            status: "model-download-required",
            locale: "en-US",
        });
    });

    it("preserves the missing-model result when the fallback reports no speech", async () => {
        const { module, emit } = createSpeechModule({
            services: ["com.google.android.as", "com.google.android.tts"],
            defaultService: "com.google.android.tts",
        });
        const pending = recognizeAndroidSpeechAsync({
            module,
            platform: "android",
            locale: "en-US",
            timeoutMs: 1_000,
            serviceRetryDelayMs: 0,
        });
        await Promise.resolve();
        await Promise.resolve();
        emit("error", {
            error: "language-not-supported",
            message: "Offline model is missing",
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        emit("error", {
            error: "no-speech",
            message: "Fallback service ended without a transcript",
        });

        await expect(pending).resolves.toEqual({
            status: "model-download-required",
            locale: "en-US",
        });
    });

    it("times out when Android never finishes the model download request", async () => {
        const { module } = createSpeechModule();
        module.androidTriggerOfflineModelDownload = vi.fn(() => new Promise<never>(() => {}));

        await expect(downloadAndroidSpeechRecognitionModel("en-US", module, 5)).resolves.toEqual({
            status: "error",
            message: "Speech model download did not finish. Check the Android speech service and try again.",
        });
    });

    it("keeps an opened Android model dialog distinct from a completed download", async () => {
        const { module } = createSpeechModule();
        module.androidTriggerOfflineModelDownload = vi.fn(async () => ({
            status: "opened_dialog" as const,
        }));

        await expect(downloadAndroidSpeechRecognitionModel("en-US", module)).resolves.toEqual({
            status: "opened-dialog",
        });
    });

    it("maps a native service failure to the unavailable degradation path", async () => {
        const { module, emit } = createSpeechModule();
        const pending = recognizeAndroidSpeechAsync({
            module,
            platform: "android",
            timeoutMs: 1_000,
        });
        await Promise.resolve();
        await Promise.resolve();
        emit("error", {
            error: "service-not-allowed",
            message: "Recognizer is unavailable",
        });

        await expect(pending).resolves.toMatchObject({
            status: "unavailable",
            capability: { available: false },
        });
    });

    it("cancels active recognition immediately and aborts the native service", async () => {
        const { module } = createSpeechModule();
        const session = startAndroidSpeechRecognition({
            module,
            platform: "android",
            timeoutMs: 1_000,
        });
        await Promise.resolve();
        await Promise.resolve();

        session.cancel();

        await expect(session.result).resolves.toEqual({ status: "cancelled" });
        expect(module.abort).toHaveBeenCalledTimes(1);
    });
});
