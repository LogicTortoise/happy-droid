import { describe, expect, it, vi } from "vitest";

vi.mock("expo-speech", () => ({
    getAvailableVoicesAsync: vi.fn(async () => []),
    stop: vi.fn(async () => undefined),
    speak: vi.fn(),
}));

import {
    getLocalTextToSpeechCapability,
    speakLocalVoiceReply,
    type LocalTextToSpeechAdapter,
    type LocalTextToSpeechVoice,
} from "./localTextToSpeech";

const englishUs = { identifier: "english-us", language: "en-US", name: "English US" };
const englishGb = { identifier: "english-gb", language: "en-GB", name: "English UK" };
const mandarin = { identifier: "mandarin", language: "zh-CN", name: "Mandarin" };

function createAdapter(voices: Promise<LocalTextToSpeechVoice[]>): LocalTextToSpeechAdapter {
    return {
        getAvailableVoicesAsync: vi.fn(() => voices),
        stop: vi.fn(async () => undefined),
        speak: vi.fn(),
    };
}

describe("local text-to-speech capability", () => {
    it("does not call speak when Android has no installed voices", async () => {
        const adapter = createAdapter(Promise.resolve([]));

        await expect(speakLocalVoiceReply("Reply", {}, { adapter, locale: "en-US" })).resolves.toEqual({
            available: false,
            reason: "no-voices",
        });
        expect(adapter.stop).not.toHaveBeenCalled();
        expect(adapter.speak).not.toHaveBeenCalled();
    });

    it("selects an exact locale instead of an unrelated default voice", async () => {
        const adapter = createAdapter(Promise.resolve([mandarin, englishUs]));

        await expect(speakLocalVoiceReply("Reply", {}, { adapter, locale: "en_US" })).resolves.toEqual({
            available: true,
            voiceCount: 2,
            voice: englishUs,
        });
        expect(adapter.speak).toHaveBeenCalledWith("Reply", expect.objectContaining({
            language: "en-US",
            voice: "english-us",
        }));
    });

    it("falls back to the same base language", async () => {
        const adapter = createAdapter(Promise.resolve([mandarin, englishGb]));

        const capability = await speakLocalVoiceReply("Reply", {}, { adapter, locale: "en-AU" });

        expect(capability).toEqual({ available: true, voiceCount: 2, voice: englishGb });
    });

    it("refuses to use an unrelated installed language", async () => {
        const adapter = createAdapter(Promise.resolve([mandarin]));

        await expect(speakLocalVoiceReply("Reply", {}, { adapter, locale: "en-US" })).resolves.toEqual({
            available: false,
            reason: "language-unavailable",
        });
        expect(adapter.stop).not.toHaveBeenCalled();
        expect(adapter.speak).not.toHaveBeenCalled();
    });

    it("returns a fallback signal when stop rejects", async () => {
        const adapter = createAdapter(Promise.resolve([englishUs]));
        vi.mocked(adapter.stop).mockRejectedValueOnce(new Error("stop failed"));

        await expect(speakLocalVoiceReply("Reply", {}, { adapter, locale: "en-US" })).resolves.toEqual({
            available: false,
            reason: "error",
        });
        expect(adapter.speak).not.toHaveBeenCalled();
    });

    it("returns a fallback signal when speak throws synchronously", async () => {
        const adapter = createAdapter(Promise.resolve([englishUs]));
        vi.mocked(adapter.speak).mockImplementationOnce(() => {
            throw new Error("speak failed");
        });

        await expect(speakLocalVoiceReply("Reply", {}, { adapter, locale: "en-US" })).resolves.toEqual({
            available: false,
            reason: "error",
        });
    });

    it("returns a timeout instead of hanging when TTS initialization never resolves", async () => {
        const adapter = createAdapter(new Promise(() => undefined));

        await expect(getLocalTextToSpeechCapability(adapter, 5, "en-US")).resolves.toEqual({
            available: false,
            reason: "timeout",
        });
    });
});
