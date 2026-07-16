import { describe, expect, it, vi } from "vitest";

vi.mock("expo-speech", () => ({
    getAvailableVoicesAsync: vi.fn(async () => []),
    stop: vi.fn(async () => undefined),
    speak: vi.fn(),
}));

import { reducer, createReducer } from "@/sync/reducer/reducer";
import { normalizeRawMessage, type RawRecord } from "@/sync/typesRaw";
import { GeminiSessionProtocol } from "../../../happy-cli/src/gemini/GeminiSessionProtocol";
import type { SessionEnvelope } from "@slopus/happy-wire";
import { resolveLocalVoiceTurnReply } from "./localVoiceMode";
import { speakLocalVoiceReply, type LocalTextToSpeechAdapter } from "./localTextToSpeech";

describe("local voice message integration", () => {
    it("selects the correlated Gemini turn and starts locale-matched TTS after turn-end", async () => {
        const protocol = new GeminiSessionProtocol();
        const geminiEnvelopes = [
            ...protocol.startTurn("normal-local-id"),
            ...protocol.endTurn("completed", "This normal reply must not be spoken."),
            ...protocol.startTurn("voice-local-id"),
            ...protocol.endTurn("completed", "The build passed."),
            ...protocol.startTurn("normal-after-local-id"),
            ...protocol.endTurn("completed", "This later reply must not be spoken."),
        ];
        const rawFromEnvelope = (envelope: SessionEnvelope): RawRecord => ({
            role: "session",
            content: { type: "session", data: envelope },
        });
        const rawRecords: Array<{ id: string; localId: string | null; seq: number; raw: RawRecord }> = [
            {
                id: "server-user",
                localId: "voice-local-id",
                seq: 40,
                raw: {
                    role: "user",
                    content: { type: "text", text: "Summarize the build" },
                    localKey: "voice-local-id",
                    meta: { voiceMode: true },
                },
            },
            ...geminiEnvelopes.map((envelope, index) => ({
                id: `gemini-${index}`,
                localId: null,
                seq: 41 + index,
                raw: rawFromEnvelope(envelope),
            })),
        ];
        const state = createReducer();
        const optimisticUser = normalizeRawMessage(
            "voice-local-id",
            "voice-local-id",
            99_999,
            rawRecords[0].raw,
        );
        if (!optimisticUser) {
            throw new Error("Expected optimistic user message to normalize");
        }
        reducer(state, [optimisticUser]);

        const normalized = rawRecords.map(({ id, localId, seq, raw }) => (
            normalizeRawMessage(id, localId, 10_000 - seq, raw, seq)
        )).filter((message) => message !== null);
        const result = reducer(state, normalized);
        const reply = resolveLocalVoiceTurnReply(result.messages, "voice-local-id");

        expect(reply).toMatchObject({ status: "finished", text: "The build passed." });
        if (reply.status !== "finished" || !reply.text) {
            throw new Error("Expected a completed voice reply");
        }

        const adapter: LocalTextToSpeechAdapter = {
            getAvailableVoicesAsync: vi.fn(async () => [
                { identifier: "zh", language: "zh-CN" },
                { identifier: "en", language: "en-US" },
            ]),
            stop: vi.fn(async () => undefined),
            speak: vi.fn(),
        };

        await expect(speakLocalVoiceReply(reply.text, {}, { adapter, locale: "en-US" })).resolves.toMatchObject({
            available: true,
            voice: { identifier: "en", language: "en-US" },
        });
        expect(adapter.speak).toHaveBeenCalledWith("The build passed.", expect.objectContaining({
            language: "en-US",
            voice: "en",
        }));
    });

    it("resolves two voice turns independently across adjacent normal input", () => {
        const protocol = new GeminiSessionProtocol();
        const envelopes = [
            ...protocol.startTurn("voice-one"),
            ...protocol.endTurn("completed", "First spoken reply."),
            ...protocol.startTurn("normal-between"),
            ...protocol.endTurn("completed", "Never speak this."),
            ...protocol.startTurn("voice-two"),
            ...protocol.endTurn("completed", "Second spoken reply."),
        ];
        const rawRecords: Array<{ id: string; localId: string | null; seq: number; raw: RawRecord }> = [
            { id: "u1", localId: "voice-one", seq: 1, raw: { role: "user", content: { type: "text", text: "First" }, localKey: "voice-one", meta: { voiceMode: true } } },
            ...envelopes.slice(0, 3).map((envelope, index) => ({ id: `e1-${index}`, localId: null, seq: 2 + index, raw: { role: "session", content: { type: "session", data: envelope } } as RawRecord })),
            { id: "u2", localId: "normal-between", seq: 5, raw: { role: "user", content: { type: "text", text: "Normal" }, localKey: "normal-between", meta: {} } },
            ...envelopes.slice(3, 6).map((envelope, index) => ({ id: `e2-${index}`, localId: null, seq: 6 + index, raw: { role: "session", content: { type: "session", data: envelope } } as RawRecord })),
            { id: "u3", localId: "voice-two", seq: 9, raw: { role: "user", content: { type: "text", text: "Second" }, localKey: "voice-two", meta: { voiceMode: true } } },
            ...envelopes.slice(6).map((envelope, index) => ({ id: `e3-${index}`, localId: null, seq: 10 + index, raw: { role: "session", content: { type: "session", data: envelope } } as RawRecord })),
        ];
        const normalized = rawRecords.map(({ id, localId, seq, raw }) => normalizeRawMessage(id, localId, 1000 + seq, raw, seq))
            .filter((message) => message !== null);
        const result = reducer(createReducer(), normalized);

        expect(resolveLocalVoiceTurnReply(result.messages, "voice-one")).toMatchObject({ text: "First spoken reply." });
        expect(resolveLocalVoiceTurnReply(result.messages, "voice-two")).toMatchObject({ text: "Second spoken reply." });
    });
});
