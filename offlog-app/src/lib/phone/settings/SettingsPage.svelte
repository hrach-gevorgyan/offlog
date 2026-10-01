<script lang="ts">
  // One pushed settings page, screen { k: 'set', page }.
  import PrefsPage from './PrefsPage.svelte';
  import TrashPage from './TrashPage.svelte';
  import HistoryPage from './HistoryPage.svelte';
  import ArchivedPage from './ArchivedPage.svelte';

  export let page: string;
</script>

{#if page === 'trash'}
  <TrashPage />
{:else if page === 'history'}
  <HistoryPage />
{:else if page === 'archived'}
  <ArchivedPage />
{:else}
  <PrefsPage {page} />
{/if}
