export type PendingNewSessionSubmission = {
    sessionId: string;
    prompt: string;
    localId: string;
    status: 'pending' | 'failed';
    createdAt: number;
    lastError?: string;
};

export type NewSessionSubmissionPlan =
    | { type: 'spawn-new'; prompt: string }
    | { type: 'retry-pending'; sessionId: string; prompt: string };

export function createPendingNewSessionSubmission(
    sessionId: string,
    prompt: string,
    options: { localId: string; now?: number; lastError?: string; status?: PendingNewSessionSubmission['status'] },
): PendingNewSessionSubmission | null {
    const trimmedSessionId = sessionId.trim();
    const trimmedPrompt = prompt.trim();
    const trimmedLocalId = options.localId.trim();
    if (!trimmedSessionId || !trimmedPrompt || !trimmedLocalId) {
        return null;
    }

    return {
        sessionId: trimmedSessionId,
        prompt: trimmedPrompt,
        localId: trimmedLocalId,
        status: options.status ?? (options.lastError ? 'failed' : 'pending'),
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
        localId?: unknown;
        status?: unknown;
        createdAt?: unknown;
        lastError?: unknown;
    };
    if (
        typeof candidate.sessionId !== 'string'
        || typeof candidate.prompt !== 'string'
        || typeof candidate.localId !== 'string'
    ) {
        return null;
    }

    const lastError = typeof candidate.lastError === 'string' ? candidate.lastError : undefined;
    const pending = createPendingNewSessionSubmission(candidate.sessionId, candidate.prompt, {
        localId: candidate.localId,
        now: typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now(),
        lastError,
        status: candidate.status === 'failed' || lastError ? 'failed' : 'pending',
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
            prompt: pending.prompt,
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
