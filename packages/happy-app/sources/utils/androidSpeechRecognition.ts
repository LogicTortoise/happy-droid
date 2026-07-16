import type {
    ExpoSpeechRecognitionErrorEvent,
    ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import { getLocales } from "expo-localization";
import { Platform } from "react-native";

type EventSubscription = {
    remove(): void;
};

export type AndroidSpeechRecognitionCapability = {
    available: boolean;
    services: string[];
    defaultService: string | null;
    reason?: "native-module-missing" | "service-unavailable" | "capability-check-failed";
};

export type AndroidSpeechRecognitionOutcome =
    | { status: "recognized"; transcript: string; service: string | null; locale: string }
    | { status: "cancelled" }
    | { status: "unavailable"; capability: AndroidSpeechRecognitionCapability }
    | { status: "model-download-required"; locale: string }
    | { status: "permission-denied"; canAskAgain: boolean }
    | { status: "error"; code: string; message: string };

export type AndroidSpeechModelDownloadOutcome =
    | { status: "ready" | "opened-dialog" }
    | { status: "error"; message: string };

export type AndroidSpeechRecognitionModule = {
    isRecognitionAvailable(): boolean;
    getSpeechRecognitionServices(): string[];
    getDefaultRecognitionService(): { packageName: string };
    requestMicrophonePermissionsAsync(): Promise<{ granted: boolean; canAskAgain?: boolean }>;
    androidTriggerOfflineModelDownload(options: { locale: string }): Promise<{
        status: "download_success" | "opened_dialog" | "download_canceled";
        message?: string;
    }>;
    addListener(event: "result", listener: (event: ExpoSpeechRecognitionResultEvent) => void): EventSubscription;
    addListener(event: "error", listener: (event: ExpoSpeechRecognitionErrorEvent) => void): EventSubscription;
    addListener(event: "end", listener: () => void): EventSubscription;
    start(options: {
        lang: string;
        continuous: boolean;
        interimResults: boolean;
        maxAlternatives: number;
        androidRecognitionServicePackage?: string;
    }): void;
    abort(): void;
};

type RecognitionOptions = {
    locale?: string;
    timeoutMs?: number;
    serviceRetryDelayMs?: number;
    module?: AndroidSpeechRecognitionModule;
    platform?: string;
};

export type AndroidSpeechRecognitionSession = {
    result: Promise<AndroidSpeechRecognitionOutcome>;
    cancel(): void;
};

const DEFAULT_RECOGNITION_TIMEOUT_MS = 45_000;
const DEFAULT_SERVICE_RETRY_DELAY_MS = 150;
const DEFAULT_MODEL_DOWNLOAD_TIMEOUT_MS = 120_000;
const ANDROID_ON_DEVICE_SERVICE = "com.google.android.as";
const RETRYABLE_SERVICE_ERRORS = new Set([
    "network",
    "service-not-allowed",
    "language-not-supported",
    "start-failed",
]);

export function getAndroidSpeechRecognitionCapability(
    module?: AndroidSpeechRecognitionModule,
): AndroidSpeechRecognitionCapability {
    let speechModule: AndroidSpeechRecognitionModule;
    try {
        speechModule = module ?? loadSpeechRecognitionModule();
    } catch {
        return {
            available: false,
            services: [],
            defaultService: null,
            reason: "native-module-missing",
        };
    }

    try {
        const services = speechModule.getSpeechRecognitionServices().filter(Boolean);
        const defaultService = speechModule.getDefaultRecognitionService().packageName.trim() || null;
        const available = speechModule.isRecognitionAvailable()
            && (services.length > 0 || defaultService !== null);
        return {
            available,
            services,
            defaultService,
            ...(available ? {} : { reason: "service-unavailable" as const }),
        };
    } catch {
        return {
            available: false,
            services: [],
            defaultService: null,
            reason: "capability-check-failed",
        };
    }
}

export async function recognizeAndroidSpeechAsync(
    options: RecognitionOptions = {},
): Promise<AndroidSpeechRecognitionOutcome> {
    return await startAndroidSpeechRecognition(options).result;
}

export function startAndroidSpeechRecognition(
    options: RecognitionOptions = {},
): AndroidSpeechRecognitionSession {
    const controller = new AbortController();
    return {
        result: recognizeAndroidSpeechWithSignal(options, controller.signal),
        cancel: () => controller.abort(),
    };
}

async function recognizeAndroidSpeechWithSignal(
    options: RecognitionOptions,
    signal: AbortSignal,
): Promise<AndroidSpeechRecognitionOutcome> {
    if (signal.aborted) {
        return { status: "cancelled" };
    }
    if ((options.platform ?? Platform.OS) !== "android") {
        return { status: "cancelled" };
    }

    let speechModule: AndroidSpeechRecognitionModule;
    try {
        speechModule = options.module ?? loadSpeechRecognitionModule();
    } catch {
        return {
            status: "unavailable",
            capability: getAndroidSpeechRecognitionCapability(),
        };
    }

    const capability = getAndroidSpeechRecognitionCapability(speechModule);
    if (!capability.available) {
        return { status: "unavailable", capability };
    }

    const permission = await speechModule.requestMicrophonePermissionsAsync();
    if (signal.aborted) {
        return { status: "cancelled" };
    }
    if (!permission.granted) {
        return {
            status: "permission-denied",
            canAskAgain: permission.canAskAgain !== false,
        };
    }

    const locale = options.locale ?? getLocales()[0]?.languageTag ?? "en-US";
    const services = orderRecognitionServices(capability);
    return await recognizeWithServices(
        speechModule,
        locale,
        services,
        options.timeoutMs ?? DEFAULT_RECOGNITION_TIMEOUT_MS,
        options.serviceRetryDelayMs ?? DEFAULT_SERVICE_RETRY_DELAY_MS,
        signal,
    );
}

export async function downloadAndroidSpeechRecognitionModel(
    locale?: string,
    module?: AndroidSpeechRecognitionModule,
    timeoutMs = DEFAULT_MODEL_DOWNLOAD_TIMEOUT_MS,
): Promise<AndroidSpeechModelDownloadOutcome> {
    try {
        const speechModule = module ?? loadSpeechRecognitionModule();
        const result = await withTimeout(
            speechModule.androidTriggerOfflineModelDownload({
                locale: locale ?? getLocales()[0]?.languageTag ?? "en-US",
            }),
            timeoutMs,
            "Speech model download did not finish. Check the Android speech service and try again.",
        );
        if (result.status === "download_success") {
            return { status: "ready" };
        }
        if (result.status === "opened_dialog") {
            return { status: "opened-dialog" };
        }
        return {
            status: "error",
            message: result.message ?? "Android canceled the speech model download.",
        };
    } catch (error) {
        return {
            status: "error",
            message: error instanceof Error ? error.message : String(error),
        };
    }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return await new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
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

function orderRecognitionServices(capability: AndroidSpeechRecognitionCapability): Array<string | null> {
    const services = [
        capability.services.includes(ANDROID_ON_DEVICE_SERVICE) ? ANDROID_ON_DEVICE_SERVICE : null,
        capability.defaultService,
        ...capability.services,
    ].filter((service): service is string => Boolean(service));

    const uniqueServices = [...new Set(services)];
    return uniqueServices.length > 0 ? uniqueServices : [null];
}

function shouldTryNextService(outcome: AndroidSpeechRecognitionOutcome): boolean {
    return outcome.status === "unavailable"
        || (outcome.status === "error" && RETRYABLE_SERVICE_ERRORS.has(outcome.code));
}

async function recognizeWithServices(
    speechModule: AndroidSpeechRecognitionModule,
    locale: string,
    services: Array<string | null>,
    timeoutMs: number,
    serviceRetryDelayMs: number,
    signal: AbortSignal,
): Promise<AndroidSpeechRecognitionOutcome> {
    return await new Promise((resolve) => {
        let settled = false;
        let serviceIndex = 0;
        let activeService: string | null = null;
        let languageModelMissing = false;
        let retryPending = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;
        const subscriptions: EventSubscription[] = [];
        let abortHandler: (() => void) | null = null;

        const finish = (outcome: AndroidSpeechRecognitionOutcome) => {
            if (settled) {
                return;
            }
            settled = true;
            if (timer) {
                clearTimeout(timer);
            }
            if (retryTimer) {
                clearTimeout(retryTimer);
            }
            if (abortHandler) {
                signal.removeEventListener("abort", abortHandler);
            }
            for (const subscription of subscriptions) {
                subscription.remove();
            }
            resolve(outcome);
        };

        abortHandler = () => {
            finish({ status: "cancelled" });
            try {
                speechModule.abort();
            } catch {
                // Cancellation is complete even if the native recognizer already stopped.
            }
        };
        signal.addEventListener("abort", abortHandler, { once: true });
        if (signal.aborted) {
            abortHandler();
            return;
        }

        const finishServiceFailure = (outcome: AndroidSpeechRecognitionOutcome) => {
            finish(languageModelMissing
                ? { status: "model-download-required", locale }
                : outcome);
        };

        const startNextService = (lastOutcome?: AndroidSpeechRecognitionOutcome) => {
            if (settled) {
                return;
            }
            const service = services[serviceIndex++];
            if (service === undefined) {
                finish(lastOutcome ?? {
                    status: "error",
                    code: "start-failed",
                    message: "No Android speech recognition service could be started.",
                });
                return;
            }

            activeService = service;
            retryPending = false;
            try {
                speechModule.start({
                    lang: locale,
                    continuous: false,
                    interimResults: false,
                    maxAlternatives: 1,
                    ...(service ? { androidRecognitionServicePackage: service } : {}),
                });
            } catch (error) {
                const outcome: AndroidSpeechRecognitionOutcome = {
                    status: "error",
                    code: "start-failed",
                    message: error instanceof Error ? error.message : String(error),
                };
                if (serviceIndex < services.length) {
                    retryPending = true;
                    retryTimer = setTimeout(() => startNextService(outcome), serviceRetryDelayMs);
                } else {
                    finishServiceFailure(outcome);
                }
            }
        };

        subscriptions.push(speechModule.addListener("result", (event) => {
            if (!event.isFinal) {
                return;
            }
            const transcript = event.results
                .map((result) => ({
                    transcript: result.transcript.trim(),
                    confidence: result.confidence > 0 ? result.confidence : 0,
                }))
                .filter((result) => result.transcript.length > 0)
                .sort((left, right) => (
                    right.confidence - left.confidence
                    || right.transcript.length - left.transcript.length
                ))[0]?.transcript;
            finish(transcript
                ? { status: "recognized", transcript, service: activeService, locale }
                : { status: "cancelled" });
        }));
        subscriptions.push(speechModule.addListener("error", (event) => {
            if (event.error === "aborted") {
                finish({ status: "cancelled" });
                return;
            }
            if (event.error === "no-speech" || event.error === "speech-timeout") {
                finishServiceFailure({ status: "cancelled" });
                return;
            }
            if (event.error === "service-not-allowed" || event.error === "language-not-supported") {
                languageModelMissing ||= event.error === "language-not-supported";
                const outcome: AndroidSpeechRecognitionOutcome = {
                    status: "unavailable",
                    capability: {
                        available: false,
                        services: activeService ? [activeService] : [],
                        defaultService: activeService,
                        reason: "service-unavailable",
                    },
                };
                if (serviceIndex < services.length) {
                    retryPending = true;
                    retryTimer = setTimeout(() => startNextService(outcome), serviceRetryDelayMs);
                } else {
                    finishServiceFailure(outcome);
                }
                return;
            }
            if (event.error === "not-allowed") {
                finish({ status: "permission-denied", canAskAgain: false });
                return;
            }
            const outcome: AndroidSpeechRecognitionOutcome = {
                status: "error",
                code: event.error,
                message: event.message,
            };
            if (serviceIndex < services.length && shouldTryNextService(outcome)) {
                retryPending = true;
                retryTimer = setTimeout(() => startNextService(outcome), serviceRetryDelayMs);
            } else {
                finishServiceFailure(outcome);
            }
        }));
        subscriptions.push(speechModule.addListener("end", () => {
            if (!retryPending) {
                finishServiceFailure({ status: "cancelled" });
            }
        }));

        timer = setTimeout(() => {
            finishServiceFailure({
                status: "error",
                code: "timeout",
                message: "Speech recognition did not finish before the timeout.",
            });
            try {
                speechModule.abort();
            } catch {
                // The service may already be gone; the timeout result is authoritative.
            }
        }, timeoutMs);
        startNextService();
    });
}

function loadSpeechRecognitionModule(): AndroidSpeechRecognitionModule {
    // Keep loading lazy so Expo Go or stale native builds degrade to an explicit
    // unavailable result instead of crashing while the Session screen imports.
    const { ExpoSpeechRecognitionModule } = require("expo-speech-recognition") as typeof import("expo-speech-recognition");
    return ExpoSpeechRecognitionModule as unknown as AndroidSpeechRecognitionModule;
}
