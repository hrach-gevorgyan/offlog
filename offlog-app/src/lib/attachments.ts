// File attachments: shared size cap and mime mapping, used by both
// CardDetail.svelte (validates on pick, before doing any work) and db.ts
// (validates again on write -- defense in depth).
//
// There is deliberately no format allowlist: any file type is attachable
// except HEIC/HEIF. An extension check would be curation, not protection --
// attachments are never executed, only stored and downloaded, and a rename
// bypasses it anyway. HEIC/HEIF is rejected on technical merit: canvas-based
// downscaling (CardDetail's compression step) can't reliably decode it in a
// browser/webview, so it's rejected with a clear message rather than silently
// failing to compress or preview.
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10MB, hard cap regardless of format

export const ATTACHMENT_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;
const ATTACHMENT_REJECTED_EXTENSIONS = ['heic', 'heif'];

const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json',
  yaml: 'application/x-yaml', yml: 'application/x-yaml', xml: 'application/xml', md: 'text/markdown',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function attachmentExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

export function isAttachmentExtensionAllowed(filename: string): boolean {
  return !ATTACHMENT_REJECTED_EXTENSIONS.includes(attachmentExtension(filename));
}

export function isAttachmentImage(filename: string): boolean {
  return (ATTACHMENT_IMAGE_EXTENSIONS as readonly string[]).includes(attachmentExtension(filename));
}

// Unrecognized extensions fall back to a generic binary type -- still a
// perfectly valid attachment (stored/downloaded as-is), just not one this
// app has a specific icon/preview treatment for.
export function attachmentMimeType(filename: string): string {
  return EXTENSION_MIME[attachmentExtension(filename)] ?? 'application/octet-stream';
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
