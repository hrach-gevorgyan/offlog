// v6.8.0 — file attachments: shared size cap and mime mapping used by
// both CardDetail.svelte (validates on pick, before doing any work) and
// db.ts (validates again on write -- defense in depth, same reasoning as
// every other input boundary in this app).
//
// Owner decision, 2026-07-30: no format allowlist -- any file type is
// attachable except HEIC/HEIF. An extension check on top of that would
// mostly be curation, not protection (Offlog never executes an
// attachment, just stores and downloads bytes -- the same trust decision
// as any downloaded file, and trivially bypassed by renaming anyway), and
// most formats already can't be previewed in-app regardless of whether
// they're "allowed" (docx/xlsx/pdf all just show as a generic file chip +
// download). HEIC/HEIF stays rejected on its own technical merit: the
// default format iPhone cameras save to, but canvas-based downscaling
// (CardDetail's compression step) can't reliably decode it in a browser/
// webview today -- rejected with a clear message rather than silently
// failing to compress/preview.
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
