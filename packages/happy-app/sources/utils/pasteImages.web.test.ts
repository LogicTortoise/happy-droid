import { describe, expect, it, vi } from 'vitest';

import {
    fileToAttachmentPreview,
    getFilesFromClipboard,
    getFilesFromDrop,
} from './pasteImages.web';

function makeFile(name: string, type: string, size = 12): File {
    return new File([new Uint8Array(size)], name, { type });
}

describe('pasteImages web attachment helpers', () => {
    it('extracts arbitrary files from clipboard items', () => {
        const pdf = makeFile('report.pdf', 'application/pdf');
        const png = makeFile('photo.png', 'image/png');
        const event = {
            clipboardData: {
                items: [
                    { kind: 'string', type: 'text/plain', getAsFile: () => null },
                    { kind: 'file', type: 'application/pdf', getAsFile: () => pdf },
                    { kind: 'file', type: 'image/png', getAsFile: () => png },
                ],
            },
        } as unknown as ClipboardEvent;

        expect(getFilesFromClipboard(event)).toEqual([pdf, png]);
    });

    it('extracts arbitrary files from drops', () => {
        const pdf = makeFile('report.pdf', 'application/pdf');
        const zip = makeFile('archive.zip', 'application/zip');
        const event = {
            dataTransfer: {
                files: [pdf, zip],
            },
        } as unknown as DragEvent;

        expect(getFilesFromDrop(event)).toEqual([pdf, zip]);
    });

    it('creates generic attachment previews for non-image files', async () => {
        const pdf = makeFile('report.pdf', 'application/pdf', 42);
        const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');

        await expect(fileToAttachmentPreview(pdf, vi.fn())).resolves.toEqual({
            uri: 'blob:report',
            width: 0,
            height: 0,
            size: 42,
            name: 'report.pdf',
            mimeType: 'application/pdf',
            thumbhash: undefined,
        });
        expect(createObjectURL).toHaveBeenCalledWith(pdf);

        createObjectURL.mockRestore();
    });
});
