/**
 * Shared types for attachment upload pipeline.
 * Defined here (not in hooks/) to avoid circular dependencies:
 * hooks/ imports from sync/, so sync/ cannot import from hooks/.
 */

export type AttachmentPreview = {
    /** Stable unique identifier for use as React key and for removal. */
    id: string;
    uri: string;
    /** Image attachments carry dimensions; generic files use 0/0. */
    width: number;
    height: number;
    mimeType: string;
    /** May be 0 if the system did not provide the file size. */
    size: number;
    name: string;
    thumbhash?: string;
};

/** Result of a successful attachment upload — ready to build a file event. */
export type UploadedAttachment = {
    ref: string;
    name: string;
    mimeType: string;
    size: number;
    width: number;
    height: number;
    thumbhash?: string;
};

export function isImageAttachment(attachment: { mimeType?: string | null; width?: number; height?: number }): boolean {
    return Boolean(attachment.mimeType?.startsWith('image/'));
}

export function hasImageMetadata(attachment: { width?: number; height?: number }): attachment is { width: number; height: number } {
    return (attachment.width ?? 0) > 0 && (attachment.height ?? 0) > 0;
}
