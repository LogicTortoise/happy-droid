import { describe, expect, it } from "vitest";

import {
    enqueueLocalVoiceRequest,
    getSpeakableText,
    removeLocalVoiceRequest,
    resolveLocalVoiceTurnReply,
} from "./localVoiceMode";
import type { Message, SessionTurnStatus } from "@/sync/typesMessage";

function user(localId: string, serverSequence?: number, createdAt = 100): Message {
    return { kind: "user-text", id: `user-${localId}`, localId, createdAt, text: "Question", serverSequence };
}

function turn(
    turnId: string,
    turnStatus: SessionTurnStatus,
    serverSequence: number,
    createdAt = 100,
    localId: string | null = null,
): Message {
    return {
        kind: "agent-event",
        id: `${turnId}-${turnStatus}-${serverSequence}`,
        createdAt,
        event: { type: "ready" },
        turnId,
        turnStatus,
        serverSequence,
        localId,
    };
}

function agent(turnId: string, serverSequence: number, text: string, createdAt = 100, isThinking = false): Message {
    return {
        kind: "agent-text",
        id: `${turnId}-text-${serverSequence}`,
        localId: null,
        createdAt,
        text,
        isThinking,
        turnId,
        serverSequence,
    };
}

describe("local voice mode helpers", () => {
    it("keeps consecutive voice requests independent and removes only the completed request", () => {
        const first = enqueueLocalVoiceRequest([], { localId: "voice-1", locale: "en-US" });
        const both = enqueueLocalVoiceRequest(first, { localId: "voice-2", locale: "zh-CN" });

        expect(both.map((request) => request.localId)).toEqual(["voice-1", "voice-2"]);
        expect(removeLocalVoiceRequest(both, "voice-1")).toEqual([
            { localId: "voice-2", locale: "zh-CN" },
        ]);
    });

    it("cleans markdown-heavy agent text for text-to-speech", () => {
        expect(getSpeakableText("## Done\nSee [the file](happy://file?ref=x) and `npm test`.\n```ts\nconst x = 1\n```"))
            .toBe("Done See the file and npm test.");
    });

    it("correlates by server sequence and turn despite reversed client clocks", () => {
        const messages = [
            turn("voice-turn", "completed", 13, -1),
            agent("voice-turn", 12, "Ready.", 0),
            turn("voice-turn", "started", 11, 1, "voice"),
            user("voice", 10, 9_999_999),
        ];

        expect(resolveLocalVoiceTurnReply(messages, "voice")).toEqual({
            status: "finished",
            turnId: "voice-turn",
            turnStatus: "completed",
            id: "voice-turn:13",
            text: "Ready.",
        });
    });

    it("ignores an already-running turn and later concurrent turns", () => {
        const messages = [
            turn("later-turn", "completed", 22),
            agent("later-turn", 21, "Do not read later."),
            turn("later-turn", "started", 20),
            user("later-user", 19),
            turn("voice-turn", "completed", 18),
            agent("voice-turn", 17, "Voice reply."),
            turn("voice-turn", "started", 16, 100, "voice"),
            turn("old-turn", "completed", 15),
            agent("old-turn", 14, "Do not read old."),
            user("voice", 13),
            turn("old-turn", "started", 10),
        ];

        expect(resolveLocalVoiceTurnReply(messages, "voice")).toMatchObject({
            status: "finished",
            turnId: "voice-turn",
            text: "Voice reply.",
        });
    });

    it("waits for the user ack and matching turn end", () => {
        expect(resolveLocalVoiceTurnReply([user("voice")], "voice")).toEqual({ status: "waiting" });
        expect(resolveLocalVoiceTurnReply([
            agent("voice-turn", 12, "Partial"),
            turn("voice-turn", "started", 11, 100, "voice"),
            user("voice", 10),
        ], "voice")).toEqual({ status: "waiting" });
    });

    it("never guesses an unassociated normal turn after a voice request", () => {
        const messages = [
            turn("normal-turn", "completed", 13),
            agent("normal-turn", 12, "Do not read this normal reply."),
            turn("normal-turn", "started", 11),
            user("voice", 10),
        ];

        expect(resolveLocalVoiceTurnReply(messages, "voice")).toEqual({ status: "waiting" });
    });

    it("aggregates completed text chunks and excludes thinking", () => {
        const messages = [
            turn("voice-turn", "completed", 15),
            agent("voice-turn", 14, "Second sentence."),
            agent("voice-turn", 13, "private thought", 100, true),
            agent("voice-turn", 12, "First sentence."),
            turn("voice-turn", "started", 11, 100, "voice"),
            user("voice", 10),
        ];

        expect(resolveLocalVoiceTurnReply(messages, "voice")).toMatchObject({
            status: "finished",
            text: "First sentence. Second sentence.",
        });
    });

    it("closes failed turns without speaking partial output", () => {
        const messages = [
            turn("voice-turn", "failed", 13),
            agent("voice-turn", 12, "Partial"),
            turn("voice-turn", "started", 11, 100, "voice"),
            user("voice", 10),
        ];

        expect(resolveLocalVoiceTurnReply(messages, "voice")).toMatchObject({
            status: "finished",
            turnStatus: "failed",
            text: null,
        });
    });
});
