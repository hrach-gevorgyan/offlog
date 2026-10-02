<script lang="ts">
  // Settings → Advanced → Privacy: the short version of docs/privacy.md.
  // Change both together.
  import { I } from '../icons';
  import { openLink, PRIVACY_URL } from '../openLink';
  import TopBar from '../TopBar.svelte';

  const POINTS = [
    { icon: I.block, title: 'Nothing is collected', text: 'No account, no analytics, no crash reports, no ads.' },
    { icon: I.phone, title: 'Your tasks stay on your devices', text: 'Everything is kept in the app’s own storage on this phone.' },
    { icon: I.repeat, title: 'Sync goes only where you say', text: 'To your own computer or your own server. Never to us, never to a cloud.' },
    { icon: I.bell, title: 'Reminders are set on the phone', text: 'Android shows them; nothing goes through a server.' },
  ];
</script>

<TopBar title="Privacy" />

<div class="p-group">
  {#each POINTS as p (p.title)}
    <div class="p-row pt">
      <span class="ri">{@html p.icon}</span>
      <span class="p-k"><span>{p.title}</span><span class="p-sub">{p.text}</span></span>
    </div>
  {/each}
</div>
<div class="p-group">
  <button class="p-row" on:click={() => openLink(PRIVACY_URL)}>
    <span class="ri">{@html I.shield}</span>
    <span class="p-k"><span>Full privacy policy</span></span>
    <span class="chev">{@html I.ext}</span>
  </button>
</div>

<style>
  .ri { width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; color: var(--muted); background: var(--col-bg); }
  .pt { cursor: default; align-items: flex-start; }
  .p-row.pt:active { background: none; }
  .chev { display: flex; margin-left: auto; color: var(--faint); }
</style>
