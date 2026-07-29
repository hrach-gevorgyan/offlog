// v6.8.0 — file attachments: shared format allowlist, size cap, and mime
// mapping used by both CardDetail.svelte (validates on pick, before doing
// any work) and db.ts (validates again on write -- defense in depth, same
// reasoning as every other input boundary in this app).
//
// Validated by file extension, not the browser-reported MIME type -- MIME
// sniffing for things like .csv/.md/.yaml is inconsistent across OS/
// browser combinations, while the extension the user picked (or the
// camera/file picker assigned) is unambiguous.
//
// HEIC/HEIF deliberately excluded (v1 scope, owner decision 2026-07-29):
// the default format iPhone cameras save to, but canvas-based downscaling
// (CardDetail's compression step) can't reliably decode it in a browser/
// webview today. Rejected with a clear message rather than silently
// failing to compress/preview.
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10MB, hard cap regardless of format

export const ATTACHMENT_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const;

// Everything else: no client-side compression possible (already-compressed
// or not compressible in a way that matters -- see the size-optimization
// discussion this came out of), just the size cap.
export const ATTACHMENT_OTHER_EXTENSIONS = [
  'svg', 'pdf', 'txt', 'csv', 'json', 'yaml', 'yml', 'xml', 'md', 'docx', 'xlsx',
] as const;

export const ATTACHMENT_ALLOWED_EXTENSIONS: readonly string[] = [...ATTACHMENT_IMAGE_EXTENSIONS, ...ATTACHMENT_OTHER_EXTENSIONS];

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
  return ATTACHMENT_ALLOWED_EXTENSIONS.includes(attachmentExtension(filename));
}

export function isAttachmentImage(filename: string): boolean {
  return (ATTACHMENT_IMAGE_EXTENSIONS as readonly string[]).includes(attachmentExtension(filename));
}

export function attachmentMimeType(filename: string): string {
  return EXTENSION_MIME[attachmentExtension(filename)] ?? 'application/octet-stream';
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
