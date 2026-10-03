<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import type { TaskDoc } from '../../types';
  import { addAttachment, deleteAttachment, getAttachmentBlob, ATTACHMENT_MAX_PER_TASK } from '../../db';
  import { ATTACHMENT_MAX_BYTES, isAttachmentExtensionAllowed, isAttachmentImage, attachmentExtension, formatAttachmentSize } from '../../attachments';
  import { blobToBase64, downscaleImage, openAttachmentFile } from '../../shared/taskHelpers';
  import { showError } from '../../store';
  import { I } from '../icons';

  export let task: TaskDoc;

  const dispatch = createEventDispatcher<{ changed: void }>();

  $: files = task.attachments ?? [];
  $: full = files.length >= ATTACHMENT_MAX_PER_TASK;

  let busy = false;
  let error = '';
  let inputEl: HTMLInputElement;
  // A remove needs a second tap on the same file: the bytes are gone for good.
  let confirming: string | null = null;

  let thumbs: Record<string, string> = {};
  $: loadThumbs(files);
  async function loadThumbs(list: typeof files) {
    for (const a of list) {
      if (thumbs[a.key] || !isAttachmentImage(a.filename)) continue;
      try { thumbs[a.key] = URL.createObjectURL(await getAttachmentBlob(task._id, a.key)); thumbs = thumbs; }
      catch { /* a thumbnail is optional */ }
    }
  }
  onDestroy(() => { for (const u of Object.values(thumbs)) URL.revokeObjectURL(u); });

  // Returns why the file was not attached, or null.
  async function attachOne(file: File, count: number): Promise<string | null> {
    if (count >= ATTACHMENT_MAX_PER_TASK) return `"${file.name}" — this task already has ${ATTACHMENT_MAX_PER_TASK} attachments (the max per task).`;
    const ext = attachmentExtension(file.name);
    if (!isAttachmentExtensionAllowed(file.name)) {
      return (ext === 'heic' || ext === 'heif')
        ? `"${file.name}" — HEIC/HEIF photos aren’t supported yet, please share or convert as JPEG first.`
        : `"${file.name}" — unsupported file type: .${ext || '?'}`;
    }
    let out: { filename: string; base64Data: string; size: number };
    try {
      out = isAttachmentImage(file.name)
        ? await downscaleImage(file)
        : { filename: file.name, base64Data: await blobToBase64(file), size: file.size };
    } catch { return `"${file.name}" — could not be attached.`; }
    if (out.size > ATTACHMENT_MAX_BYTES) return `"${file.name}" — too large (max ${ATTACHMENT_MAX_BYTES / (1024 * 1024)}MB).`;
    try {
      await addAttachment(task._id, out);
      return null;
    } catch (e) {
      // Full storage fails the same way on retry, so it gets its own advice.
      const quota = e instanceof Error && (e.name === 'QuotaExceededError' || /quota/i.test(e.message));
      return quota
        ? `"${file.name}" — your device is out of storage space. Free some up (see Settings → Data) and try again.`
        : `"${file.name}" — could not be attached.`;
    }
  }

  async function onPicked(e: Event) {
    const input = e.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    if (!picked.length) return;
    error = '';
    busy = true;
    const failures: string[] = [];
    let count = files.length;
    try {
      for (const f of picked) {
        const err = await attachOne(f, count);
        if (err) failures.push(err); else count++;
      }
    } finally { busy = false; }
    if (count > files.length) dispatch('changed');
    // Every failure is listed; a partial success leads with the count.
    if (failures.length) {
      error = picked.length === 1 ? failures[0] : `Attached ${picked.length - failures.length} of ${picked.length}. ${failures.join(' ')}`;
    }
  }

  async function remove(key: string) {
    if (confirming !== key) { confirming = key; return; }
    confirming = null;
    busy = true;
    try {
      await deleteAttachment(task._id, key);
      if (thumbs[key]) { URL.revokeObjectURL(thumbs[key]); delete thumbs[key]; thumbs = thumbs; }
      dispatch('changed');
    } catch {
      showError('Could not remove the attachment. Please try again.');
    } finally { busy = false; }
  }

  // The confirm button replaces the focused ✕, so focus moves onto it.
  const focusNow = (node: HTMLElement) => node.focus();

  async function open(key: string, filename: string) {
    try { await openAttachmentFile(await getAttachmentBlob(task._id, key), filename); }
    catch { showError('Could not open that attachment.'); }
  }
</script>

{#if files.length}
  <div class="p-group">
    {#each files as a (a.key)}
      <div class="file">
        <button class="open" on:click={() => open(a.key, a.filename)} aria-label="Open {a.filename}">
          {#if thumbs[a.key]}<img class="th" src={thumbs[a.key]} alt="" />
          {:else}<span class="th">{attachmentExtension(a.filename).toUpperCase().slice(0, 4) || 'FILE'}</span>{/if}
          <span class="p-k"><span>{a.filename}</span><span class="p-sub">{formatAttachmentSize(a.size)}</span></span>
        </button>
        {#if confirming === a.key}
          <button class="p-tbtn danger" disabled={busy} on:click={() => remove(a.key)} use:focusNow aria-label="Remove {a.filename}">Remove</button>
        {:else}
          <button class="p-ib" disabled={busy} on:click={() => remove(a.key)} aria-label="Remove {a.filename}">{@html I.x}</button>
        {/if}
      </div>
    {/each}
  </div>
{:else}
  <p class="p-empty">No files yet.</p>
{/if}

<button class="p-go" disabled={busy || full} on:click={() => inputEl.click()}>
  {busy ? 'Working…' : full ? 'Limit reached' : 'Add a file or photo'}
</button>
<!-- No `accept`: everything but HEIC/HEIF is allowed, and accept can't say "not". -->
<input bind:this={inputEl} type="file" multiple hidden on:change={onPicked} />
{#if error}<p class="p-say err" role="alert">{error}</p>{/if}
<p class="p-say note">Up to {ATTACHMENT_MAX_BYTES / (1024 * 1024)} MB each</p>

<style>
  .file { display: flex; align-items: center; gap: 8px; padding: 6px 6px 6px 16px; min-height: 56px; }
  .file + .file { border-top: 1px solid var(--border); }
  .open { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; font: inherit; font-size: var(--p-fs-m); color: var(--text); background: none; border: 0; padding: 4px 0; text-align: left; cursor: pointer; border-radius: 8px; }
  .open:active { background: var(--col-bg); }
  .th { width: 40px; height: 40px; border-radius: 8px; background: var(--col-bg); display: flex; align-items: center; justify-content: center; color: var(--faint); font-size: var(--p-fs-xs); font-weight: 700; flex-shrink: 0; object-fit: cover; }
  .p-ib :global(svg.i) { width: 18px; height: 18px; }
  .err { color: var(--danger); margin-top: 10px; }
  .note { text-align: center; margin-top: 10px; font-size: var(--p-fs-s); color: var(--faint); }
</style>
