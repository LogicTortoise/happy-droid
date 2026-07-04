export type AgentInputSendGlyph = 'spinner' | 'locked' | 'send' | 'voice';

export function resolveAgentInputSendGlyph({
    isSending,
    isSendBlocked,
    hasText,
    hasAttachments,
    hasMicPress,
    isMicActive,
}: {
    isSending?: boolean;
    isSendBlocked: boolean;
    hasText: boolean;
    hasAttachments: boolean;
    hasMicPress: boolean;
    isMicActive?: boolean;
}): AgentInputSendGlyph {
    if (isSending) return 'spinner';
    if (isSendBlocked) return 'locked';
    if (hasText || hasAttachments) return 'send';
    if (hasMicPress && !isMicActive) return 'voice';
    return 'send';
}
