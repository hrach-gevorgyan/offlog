// Pure helpers lifted out of CardDetail.svelte -- no component state, so
// they stay unit-testable without mounting the card.
import type { TaskDoc, TaskAttachment } from '../types';
import { fmtTime } from '../utils';
import { getDefaultReminderTime, isNativePlatform, isTauri } from '../../config';

export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// One-tap relative shortcuts; the exact-date picker covers everything
// else. Local calendar dates (not UTC) so "Today" can't roll over to
// yesterday west of UTC, matching how <input type="date"> works.
export function dateFromToday(days: number, months = 0): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (months) d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Derives reminder_at from due_date + the configured default time
// whenever the toggle is on and due_date changes -- recomputed live, not
// just once on enable, so editing the due date afterward keeps the
// reminder in sync without needing to re-toggle.
export function dueDateToReminderInput(date: string): string {
  const [h, m] = getDefaultReminderTime().split(':');
  return `${date}T${h}:${m}`;
}

const RECURRENCE_LABEL: Record<string, string> = { daily: 'Repeats daily', weekly: 'Repeats weekly', monthly: 'Repeats monthly' };

// Collapsed-state summary for the outer "Extras" toggle. Every value
// read must be passed in as an argument (not read from closure) so
// Svelte's static dependency analysis on the `$:` call re-runs this
// when any of them changes.
export function formatExtrasSummary(
  reminder: string, repeat: string | null, interval: number, weekdaysOnly: boolean,
  cl: { text: string; done: boolean }[], related: TaskDoc[], blocking: TaskDoc[], unresolvedCount: number, atts: TaskAttachment[], notes: string,
): string {
  const parts: string[] = [];
  if (repeat === 'daily' && weekdaysOnly) parts.push('Repeats weekdays');
  else if (repeat && interval > 1) parts.push(`Repeats every ${interval} ${repeat === 'daily' ? 'days' : repeat === 'weekly' ? 'weeks' : 'months'}`);
  else if (repeat) parts.push(RECURRENCE_LABEL[repeat]);
  if (reminder) parts.push(`${fmtTime(new Date(reminder))} reminder`);
  if (cl.length) parts.push(`${cl.filter(i => i.done).length}/${cl.length} checklist`);
  if (related.length) parts.push(`${related.length} related`);
  if (blocking.length) parts.push(unresolvedCount ? `blocked by ${unresolvedCount}` : `${blocking.length} blocked by (done)`);
  if (atts.length) parts.push(`${atts.length} attachment${atts.length > 1 ? 's' : ''}`);
  if (notes.trim()) parts.push('notes');
  return parts.length ? parts.join(' · ') : 'Repeat, reminder, checklist, custom fields, related tasks, attachments, notes';
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const MAX_IMAGE_DIMENSION = 1600;
const IMAGE_JPEG_QUALITY = 0.8;

// Re-encodes to JPEG regardless of the source image format (jpg/png/webp)
// -- one predictable output format instead of format-specific quality/
// compression tuning for each, and JPEG is universally previewable.
// Downscaling first, not just re-compressing at full resolution, is what
// actually shrinks a modern phone photo (4000px+) meaningfully.
export async function downscaleImage(file: File): Promise<{ filename: string; base64Data: string; size: number }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', IMAGE_JPEG_QUALITY);
  });
  return { filename: file.name.replace(/\.[^.]+$/, '') + '.jpg', base64Data: await blobToBase64(blob), size: blob.size };
}

// Hands an attachment to the user on whatever platform is running.
//
// A blob URL on an <a download> only works in a real browser. Capacitor's
// Android WebView has no download manager to hand it to, and neither does
// Tauri's WebView2 -- settings/helpers.ts's downloadBlob() already documents
// exactly that and works around it for backup exports. The attachment opener
// used the plain <a download> anyway, so files could be attached, stored,
// synced and backed up on Android and Windows, and never opened again.
//
// Binary, not text: downloadBlob() writes UTF-8 strings, which would corrupt
// every image and PDF.
// A filename is data, not a path. It arrives on the doc, so it can reach here
// from another device over sync or from a hand-edited backup file -- and both
// the Android and desktop branches below turn it into a real path on disk.
// Strip anything that could climb out of the directory we mean to write to.
export function safeFileName(name: string): string {
  // Both separators: a Windows-style path would survive a POSIX-only split.
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = base
    // Leading dots, so "..", "../" remnants and dotfiles cannot climb or hide.
    .replace(/^\.+/, '')
    // Control characters, and the ones Windows refuses in a filename.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:\"|?*]/g, '_')
    .trim();
  return cleaned || 'attachment';
}

export async function openAttachmentFile(blob: Blob, rawName: string): Promise<void> {
  const filename = safeFileName(rawName);
  if (isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    // No `encoding` means the base64 is written as bytes rather than text.
    const written = await Filesystem.writeFile({
      path: filename,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    });
    await Share.share({ title: filename, url: written.uri });
    return;
  }

  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const { documentDir, join } = await import('@tauri-apps/api/path');
    const ext = filename.split('.').pop() ?? 'bin';
    const defaultPath = await join(await documentDir(), filename).catch(() => filename);
    const path = await save({ defaultPath, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return; // user cancelled
    await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
