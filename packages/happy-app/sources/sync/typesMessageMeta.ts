import { z } from 'zod';

// A file attachment reference carried alongside a message. The actual file
// bytes live (E2E-encrypted) in an artifact identified by `artifactId`; see
// sources/sync/attachments.ts and docs/happy-droid/file-upload.md.
export const MessageAttachmentSchema = z.object({
    artifactId: z.string(),
    name: z.string(),
    mimeType: z.string(),
    size: z.number()
});

export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>;

// Shared message metadata schema
export const MessageMetaSchema = z.object({
    sentFrom: z.string().optional(), // Source identifier
    permissionMode: z.string().optional(), // Permission mode key for this message
    model: z.string().nullable().optional(), // Model name for this message (null = reset)
    fallbackModel: z.string().nullable().optional(), // Fallback model for this message (null = reset)
    customSystemPrompt: z.string().nullable().optional(), // Custom system prompt for this message (null = reset)
    appendSystemPrompt: z.string().nullable().optional(), // Append to system prompt for this message (null = reset)
    allowedTools: z.array(z.string()).nullable().optional(), // Allowed tools for this message (null = reset)
    disallowedTools: z.array(z.string()).nullable().optional(), // Disallowed tools for this message (null = reset)
    displayText: z.string().optional(), // Optional text to display in UI instead of actual message text
    voiceMode: z.boolean().optional(), // Message was sent while Android voice mode was enabled
    attachments: z.array(MessageAttachmentSchema).optional() // File attachments referenced by this message
});

export type MessageMeta = z.infer<typeof MessageMetaSchema>;
