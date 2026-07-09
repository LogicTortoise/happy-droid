export type PendingNewSessionSubmission = {
    sessionId: string;
    prompt: string;
    createdAt: number;
    lastError?: string;
};

export type NewSessionSubmissionPlan =
    | { type: 'spawn-new'; prompt: string }
    | { type: 'retry-pending'; sessionId: string; prompt: string };

export function createPendingNewSessionSubmission(
    sessionId: string,
    prompt: string,
    options?: { now?: number; lastError?: string },
): PendingNewSessionSubmission | null {
    const trimmedSessionId = sessionId.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedSessionId || !trimmedPrompt) {
        return null;
    }

    return {
        sessionId: trimmedSessionId,
        prompt: trimmedPrompt,
        createdAt: options?.now ?? Date.now(),
        ...(options?.lastError ? { lastError: options.lastError } : {}),
    };
}

export function normalizePendingNewSessionSubmission(value: unknown): PendingNewSessionSubmission | null {
    if (!value || typeof value !== 'object') {
        return null;
    }
    const candidate = value as {
        sessionId?: unknown;
        prompt?: unknown;
        createdAt?: unknown;
        lastError?: unknown;
    };
    if (typeof candidate.sessionId !== 'string' || typeof candidate.prompt !== 'string') {
        return null;
    }

    const pending = createPendingNewSessionSubmission(candidate.sessionId, candidate.prompt, {
        now: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
        lastError: typeof candidate.lastError === 'string' ? candidate.lastError : undefined,
    });
    return pending;
}

export function resolveNewSessionSubmissionPlan(input: {
    pendingSubmission: PendingNewSessionSubmission | null;
    currentInput: string;
}): NewSessionSubmissionPlan {
    const currentPrompt = input.currentInput.trim();
    const pending = input.pendingSubmission;

    if (pending) {
        return {
            type: 'retry-pending',
            sessionId: pending.sessionId,
            prompt: currentPrompt || pending.prompt,
        };
    }

    return {
        type: 'spawn-new',
        prompt: currentPrompt,
    };
}

export function describePendingSubmissionFailure(error: unknown): string {
    return error instanceof Error ? error.message : String(error || 'Failed to send the first message');
}
