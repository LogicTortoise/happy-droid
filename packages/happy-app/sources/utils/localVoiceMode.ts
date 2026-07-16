import type { Message, SessionTurnStatus } from "@/sync/typesMessage";

export type LocalVoiceTurnResolution =
    | { status: "waiting" }
    | { status: "finished"; turnId: string; turnStatus: Exclude<SessionTurnStatus, "started">; id: string; text: string | null };

export type LocalVoiceRequest = { localId: string; locale: string };

export function enqueueLocalVoiceRequest(
    requests: LocalVoiceRequest[],
    request: LocalVoiceRequest,
): LocalVoiceRequest[] {
    return requests.some((candidate) => candidate.localId === request.localId)
        ? requests
        : [...requests, request];
}

export function removeLocalVoiceRequest(
    requests: LocalVoiceRequest[],
    localId: string,
): LocalVoiceRequest[] {
    return requests.filter((request) => request.localId !== localId);
}

export function resolveLocalVoiceTurnReply(messages: Message[], userLocalId: string): LocalVoiceTurnResolution {
    const userMessage = messages.find((message) => (
        message.kind === "user-text" && message.localId === userLocalId
    ));
    if (userMessage?.serverSequence === undefined) {
        return { status: "waiting" };
    }

    const candidateTurnStarts = messages
        .filter((message) => (
            message.kind === "agent-event"
            && message.turnStatus === "started"
            && message.turnId
            && message.serverSequence !== undefined
            && message.serverSequence > userMessage.serverSequence!
        ))
        .sort((left, right) => left.serverSequence! - right.serverSequence!);
    const turnStart = candidateTurnStarts.find((message) => message.localId === userLocalId);
    if (!turnStart?.turnId || turnStart.serverSequence === undefined) {
        return { status: "waiting" };
    }

    const turnEnd = messages
        .filter((message) => (
            message.kind === "agent-event"
            && message.turnId === turnStart.turnId
            && message.turnStatus !== undefined
            && message.turnStatus !== "started"
            && message.serverSequence !== undefined
            && message.serverSequence > turnStart.serverSequence!
        ))
        .sort((left, right) => left.serverSequence! - right.serverSequence!)[0];
    if (!turnEnd?.turnStatus || turnEnd.turnStatus === "started" || turnEnd.serverSequence === undefined) {
        return { status: "waiting" };
    }

    const chunks = messages
        .filter((message) => (
            message.kind === "agent-text"
            && !message.isThinking
            && message.turnId === turnStart.turnId
            && message.serverSequence !== undefined
            && message.serverSequence > turnStart.serverSequence!
            && message.serverSequence < turnEnd.serverSequence!
        ))
        .sort((left, right) => left.serverSequence! - right.serverSequence!)
        .map((message) => message.kind === "agent-text" ? getSpeakableText(message.text) : null)
        .filter((text): text is string => text !== null);

    return {
        status: "finished",
        turnId: turnStart.turnId,
        turnStatus: turnEnd.turnStatus,
        id: `${turnStart.turnId}:${turnEnd.serverSequence}`,
        text: turnEnd.turnStatus === "completed" ? mergeReplyChunks(chunks) : null,
    };
}

export function getSpeakableText(text: string): string | null {
    const cleaned = text
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/<options>[\s\S]*?<\/options>/gi, " ")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[*_#>~]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    return cleaned.length > 0 ? cleaned : null;
}

function mergeReplyChunks(chunks: string[]): string | null {
    let result = "";
    for (const chunk of chunks) {
        if (!result) {
            result = chunk;
        } else if (chunk.startsWith(result)) {
            result = chunk;
        } else if (!result.endsWith(chunk)) {
            result = `${result} ${chunk}`;
        }
    }
    return result || null;
}
