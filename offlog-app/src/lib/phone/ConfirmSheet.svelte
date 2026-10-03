<script lang="ts">
  // The phone's answer to confirmAction(): a bottom sheet with the question,
  // then the action and Cancel as rows. Any way of closing it other than the
  // action row (Cancel, scrim, Back, Escape, drag) answers no.
  import { confirmRequest } from '../confirm';
  import Sheet from './Sheet.svelte';
  import { I } from './icons';

  export let req: NonNullable<typeof $confirmRequest>;

  // "Question? Detail." reads as a heading and a line under it.
  const cut = req.message.indexOf('?') + 1;
  const title = cut > 0 ? req.message.slice(0, cut) : req.message;
  const body = cut > 0 ? req.message.slice(cut).trim() : '';
  const bin = req.danger && /delete|remove|clear|empty/i.test(req.confirmLabel);

  let answer = false;
  let sheet: Sheet;
  function choose(v: boolean) { answer = v; sheet.close(); }
  // The caller hears the answer as the sheet starts to leave; the request
  // is cleared only once it has gone, or the exit would be cut short.
  function done() { if ($confirmRequest === req) confirmRequest.set(null); }
</script>

<Sheet raised label={title} bind:this={sheet} on:closing={() => req.resolve(answer)} on:close={done}>
  <div class="ask" role="alert">
    {#if bin}<span class="ic">{@html I.trash}</span>{/if}
    <div class="txt">
      <h2>{title}</h2>
      {#if body}<p>{body}</p>{/if}
    </div>
  </div>
  <div class="p-group">
    <button class="p-row" class:danger={req.danger} class:acc={!req.danger} on:click={() => choose(true)}>{req.confirmLabel}</button>
    <button class="p-row" on:click={() => choose(false)}>{req.cancelLabel}</button>
  </div>
</Sheet>

<style>
  .ask { display: flex; gap: 14px; align-items: flex-start; margin: 2px 2px 18px; }
  .ic { flex-shrink: 0; width: 42px; height: 42px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent); }
  .txt { min-width: 0; }
  h2 { margin: 0 0 6px; font-size: var(--p-fs-xl); font-weight: 700; line-height: 1.3; overflow-wrap: anywhere; }
  p { margin: 0; color: var(--muted); line-height: 1.5; white-space: pre-line; }
  .p-row.danger { font-weight: 600; }
</style>
