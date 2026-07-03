export type NewSessionSubmitStep =
    | 'idle'
    | 'creating-worktree'
    | 'spawning-session'
    | 'syncing-session'
    | 'sending-message'
    | 'navigating';

export function isNewSessionSubmitting(step: NewSessionSubmitStep): boolean {
    return step !== 'idle';
}

export function getNewSessionSubmitStatusText(step: NewSessionSubmitStep): string | null {
    switch (step) {
        case 'creating-worktree':
            return 'Creating worktree...';
        case 'spawning-session':
            return 'Starting session on machine...';
        case 'syncing-session':
            return 'Syncing session to this app...';
        case 'sending-message':
            return 'Sending first message...';
        case 'navigating':
            return 'Opening session...';
        case 'idle':
            return null;
    }
}
