import type { SpawnSessionResult } from '@/sync/ops';
import {
    createPendingNewSessionSubmission,
    describePendingSubmissionFailure,
    type PendingNewSessionSubmission,
} from './newSessionSubmissionRecovery';

export type NewSessionSubmissionLifecycleResult =
    | 'success'
    | 'initial-message-failed'
    | 'approval-requested'
    | 'spawn-error'
    | 'unexpected-error';

type NewSessionSubmissionLifecycleOptions = {
    setLoading: (loading: boolean) => void;
    spawn: () => Promise<SpawnSessionResult>;
    prepareSpawnedSession: (sessionId: string) => Promise<void> | void;
    submitInitialPrompt: (sessionId: string) => Promise<boolean>;
    onSuccess: (sessionId: string) => Promise<void> | void;
    onDirectoryApproval: (directory: string) => Promise<void> | void;
    onError: (message: string) => Promise<void> | void;
    fallbackErrorMessage: string;
};

type NewSessionInitialPromptOptions = {
    sessionId: string;
    prompt: string;
    localId: string;
    commitTimeoutMs: number;
    messages: {
        notReady: string;
        cancelEvent: string;
        timeout: string;
    };
    refreshSessions: () => Promise<void>;
    confirmSubmitted: (sessionId: string, localId: string) => Promise<boolean>;
    sendMessage: (
        sessionId: string,
        prompt: string,
        options: { source: 'new_session'; localId: string },
    ) => Promise<{ queued: boolean }>;
    waitForOutboxFlush: (sessionId: string, timeoutMs: number) => Promise<boolean>;
    cancelPendingOutbox: (sessionId: string, reason: string) => void;
    setPendingSubmission: (submission: PendingNewSessionSubmission) => void;
    clearPendingSubmission: () => void;
    setInput: (input: string) => void;
    onFailure: (message: string) => void;
};

export async function runNewSessionInitialPromptSubmission(
    options: NewSessionInitialPromptOptions,
): Promise<boolean> {
    const pending = createPendingNewSessionSubmission(options.sessionId, options.prompt, {
        localId: options.localId,
    });
    if (!pending) {
        options.clearPendingSubmission();
        options.setInput('');
        return true;
    }

    options.setPendingSubmission(pending);
    try {
        await options.refreshSessions();
        if (await options.confirmSubmitted(pending.sessionId, pending.localId)) {
            options.clearPendingSubmission();
            options.setInput('');
            return true;
        }

        const sendResult = await options.sendMessage(pending.sessionId, pending.prompt, {
            source: 'new_session',
            localId: pending.localId,
        });
        if (!sendResult.queued) {
            throw new Error(options.messages.notReady);
        }

        const committed = await options.waitForOutboxFlush(pending.sessionId, options.commitTimeoutMs);
        if (!committed && !(await options.confirmSubmitted(pending.sessionId, pending.localId))) {
            options.cancelPendingOutbox(pending.sessionId, options.messages.cancelEvent);
            throw new Error(options.messages.timeout);
        }

        options.clearPendingSubmission();
        options.setInput('');
        return true;
    } catch (error) {
        if (await options.confirmSubmitted(pending.sessionId, pending.localId)) {
            options.clearPendingSubmission();
            options.setInput('');
            return true;
        }

        const message = describePendingSubmissionFailure(error);
        options.setPendingSubmission({
            ...pending,
            status: 'failed',
            lastError: message,
        });
        options.setInput(pending.prompt);
        options.onFailure(message);
        return false;
    }
}

/**
 * Coordinates one new-session submission attempt so UI loading, failure, and
 * navigation semantics remain testable without rendering the route component.
 */
export async function runNewSessionSubmissionLifecycle(
    options: NewSessionSubmissionLifecycleOptions,
): Promise<NewSessionSubmissionLifecycleResult> {
    options.setLoading(true);
    try {
        const result = await options.spawn();
        switch (result.type) {
            case 'success': {
                await options.prepareSpawnedSession(result.sessionId);
                const submitted = await options.submitInitialPrompt(result.sessionId);
                if (!submitted) {
                    return 'initial-message-failed';
                }

                await options.onSuccess(result.sessionId);
                return 'success';
            }
            case 'requestToApproveDirectoryCreation':
                await options.onDirectoryApproval(result.directory);
                return 'approval-requested';
            case 'error':
                await options.onError(result.errorMessage);
                return 'spawn-error';
        }
    } catch (error) {
        await options.onError(error instanceof Error ? error.message : options.fallbackErrorMessage);
        return 'unexpected-error';
    } finally {
        options.setLoading(false);
    }
}
