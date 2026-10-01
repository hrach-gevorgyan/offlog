<script lang="ts">
  // A whole screen with nothing to show: the logo's two loops drawn as a
  // line, a short title, one sentence. Sheets and error notes keep the plain
  // .p-empty line; this is for screens only, so it stays rare.
  export let title: string;
  export let text = '';
</script>

<div class="empty">
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <rect x="12" y="37" width="76" height="26" rx="13" transform="rotate(45 50 50)" />
    <rect x="12" y="37" width="76" height="26" rx="13" transform="rotate(-45 50 50)" />
  </svg>
  <p class="t">{title}</p>
  {#if text}<p class="s">{text}</p>{/if}
  <slot />
</div>

<style>
  .empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 40px 24px 28px; }
  svg { width: 52px; height: 52px; margin-bottom: 8px; }
  rect { fill: none; stroke: color-mix(in srgb, var(--accent) 55%, transparent); stroke-width: 3.5; }
  .t { margin: 0; font-size: var(--p-fs-l); font-weight: 700; color: var(--text); }
  .s { margin: 0; font-size: var(--p-fs-m); color: var(--muted); max-width: 30ch; }
</style>
