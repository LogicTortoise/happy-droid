import { describe, expect, it, vi } from 'vitest';
import {
    runNewSessionInitialPromptSubmission,
    runNewSessionSubmissionLifecycle,
} from './newSessionSubmissionLifecycle';

function createDeferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

function createOptions(overrides: Partial<Parameters<typeof runNewSessionSubmissionLifecycle>[0]> = {}) {
    return {
        setLoading: vi.fn(),
        spawn: vi.fn(async () => ({ type: 'success' as const, sessionId: 'session-1' })),
        prepareSpawnedSession: vi.fn(async () => {}),
        submitInitialPrompt: vi.fn(async () => true),
        onSuccess: vi.fn(async () => {}),
        onDirectoryApproval: vi.fn(async () => {}),
        onError: vi.fn(async () => {}),
        fallbackErrorMessage: 'Failed to start session',
        ...overrides,
    };
}

function createInitialPromptOptions(
    overrides: Partial<Parameters<typeof runNewSessionInitialPromptSubmission>[0]> = {},
) {
    return {
        sessionId: 'session-1',
        prompt: ' first task ',
        localId: 'local-1',
        commitTimeoutMs: 10_000,
        messages: {
            notReady: 'not ready',
            cancelEvent: 'cancel pending first message',
            timeout: 'timed out',
        },
        refreshSessions: vi.fn(async () => {}),
        confirmSubmitted: vi.fn(async () => false),
        sendMessage: vi.fn(async () => ({ queued: true })),
        waitForOutboxFlush: vi.fn(async () => true),
        cancelPendingOutbox: vi.fn(),
        setPendingSubmission: vi.fn(),
        clearPendingSubmission: vi.fn(),
        setInput: vi.fn(),
        onFailure: vi.fn(),
        ...overrides,
    };
}

describe('runNewSessionInitialPromptSubmission', () => {
    it('persists a stable pending identity before sending and clears it after commit', async () => {
        const events: string[] = [];
        const options = createInitialPromptOptions({
            setPendingSubmission: vi.fn(() => { events.push('pending'); }),
            sendMessage: vi.fn(async () => { events.push('send'); return { queued: true }; }),
            clearPendingSubmission: vi.fn(() => { events.push('clear'); }),
            setInput: vi.fn((input) => { events.push(`input:${input}`); }),
        });

        await expect(runNewSessionInitialPromptSubmission(options)).resolves.toBe(true);

        expect(options.setPendingSubmission).toHaveBeenCalledWith(expect.objectContaining({
            sessionId: 'session-1',
            prompt: 'first task',
            localId: 'local-1',
            status: 'pending',
        }));
        expect(options.sendMessage).toHaveBeenCalledWith('session-1', 'first task', {
            source: 'new_session',
            localId: 'local-1',
        });
        expect(events).toEqual(['pending', 'send', 'clear', 'input:']);
        expect(options.onFailure).not.toHaveBeenCalled();
    });

    it('restores the prompt and persists a failed retry record when sending fails', async () => {
        const options = createInitialPromptOptions({
            sendMessage: vi.fn(async () => ({ queued: false })),
        });

        await expect(runNewSessionInitialPromptSubmission(options)).resolves.toBe(false);

        expect(options.setPendingSubmission).toHaveBeenLastCalledWith(expect.objectContaining({
            sessionId: 'session-1',
            prompt: 'first task',
            localId: 'local-1',
            status: 'failed',
            lastError: 'not ready',
        }));
        expect(options.setInput).toHaveBeenCalledWith('first task');
        expect(options.onFailure).toHaveBeenCalledWith('not ready');
        expect(options.clearPendingSubmission).not.toHaveBeenCalled();
    });

    it('cancels a timed-out outbox item before retaining recovery state', async () => {
        const options = createInitialPromptOptions({
            waitForOutboxFlush: vi.fn(async () => false),
        });

        await expect(runNewSessionInitialPromptSubmission(options)).resolves.toBe(false);

        expect(options.cancelPendingOutbox).toHaveBeenCalledWith(
            'session-1',
            'cancel pending first message',
        );
        expect(options.onFailure).toHaveBeenCalledWith('timed out');
    });
});

describe('runNewSessionSubmissionLifecycle', () => {
    it('keeps loading active until the submission attempt settles', async () => {
        const deferred = createDeferred<{ type: 'error'; errorMessage: string }>();
        const options = createOptions({ spawn: vi.fn(() => deferred.promise) });

        const resultPromise = runNewSessionSubmissionLifecycle(options);

        expect(options.setLoading).toHaveBeenCalledTimes(1);
        expect(options.setLoading).toHaveBeenLastCalledWith(true);

        deferred.resolve({ type: 'error', errorMessage: 'machine unavailable' });
        await expect(resultPromise).resolves.toBe('spawn-error');
        expect(options.setLoading).toHaveBeenNthCalledWith(1, true);
        expect(options.setLoading).toHaveBeenNthCalledWith(2, false);
    });

    it('surfaces spawn failures without preparing or navigating', async () => {
        const options = createOptions({
            spawn: vi.fn(async () => ({ type: 'error' as const, errorMessage: 'daemon offline' })),
        });

        await expect(runNewSessionSubmissionLifecycle(options)).resolves.toBe('spawn-error');

        expect(options.onError).toHaveBeenCalledWith('daemon offline');
        expect(options.prepareSpawnedSession).not.toHaveBeenCalled();
        expect(options.submitInitialPrompt).not.toHaveBeenCalled();
        expect(options.onSuccess).not.toHaveBeenCalled();
        expect(options.setLoading).toHaveBeenNthCalledWith(1, true);
        expect(options.setLoading).toHaveBeenNthCalledWith(2, false);
    });

    it('keeps the user on the composer when the first message is not committed', async () => {
        const options = createOptions({ submitInitialPrompt: vi.fn(async () => false) });

        await expect(runNewSessionSubmissionLifecycle(options)).resolves.toBe('initial-message-failed');

        expect(options.prepareSpawnedSession).toHaveBeenCalledWith('session-1');
        expect(options.submitInitialPrompt).toHaveBeenCalledWith('session-1');
        expect(options.onSuccess).not.toHaveBeenCalled();
        expect(options.setLoading).toHaveBeenNthCalledWith(1, true);
        expect(options.setLoading).toHaveBeenNthCalledWith(2, false);
    });

    it('navigates only after session preparation and the first message succeed', async () => {
        const events: string[] = [];
        const options = createOptions({
            prepareSpawnedSession: vi.fn(async () => { events.push('prepare'); }),
            submitInitialPrompt: vi.fn(async () => { events.push('submit'); return true; }),
            onSuccess: vi.fn(async () => { events.push('navigate'); }),
        });

        await expect(runNewSessionSubmissionLifecycle(options)).resolves.toBe('success');

        expect(events).toEqual(['prepare', 'submit', 'navigate']);
        expect(options.onSuccess).toHaveBeenCalledWith('session-1');
        expect(options.onError).not.toHaveBeenCalled();
        expect(options.setLoading).toHaveBeenNthCalledWith(1, true);
        expect(options.setLoading).toHaveBeenNthCalledWith(2, false);
    });

    it('clears loading and reports unexpected failures', async () => {
        const options = createOptions({
            prepareSpawnedSession: vi.fn(async () => { throw new Error('refresh failed'); }),
        });

        await expect(runNewSessionSubmissionLifecycle(options)).resolves.toBe('unexpected-error');

        expect(options.onError).toHaveBeenCalledWith('refresh failed');
        expect(options.onSuccess).not.toHaveBeenCalled();
        expect(options.setLoading).toHaveBeenNthCalledWith(1, true);
        expect(options.setLoading).toHaveBeenNthCalledWith(2, false);
    });

    it('delegates directory approval without navigating', async () => {
        const options = createOptions({
            spawn: vi.fn(async () => ({
                type: 'requestToApproveDirectoryCreation' as const,
                directory: '/workspace/new-project',
            })),
        });

        await expect(runNewSessionSubmissionLifecycle(options)).resolves.toBe('approval-requested');

        expect(options.onDirectoryApproval).toHaveBeenCalledWith('/workspace/new-project');
        expect(options.onSuccess).not.toHaveBeenCalled();
        expect(options.onError).not.toHaveBeenCalled();
    });
});
