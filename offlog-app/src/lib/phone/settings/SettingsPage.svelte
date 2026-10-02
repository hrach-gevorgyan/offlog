<script lang="ts">
  // One pushed settings page, screen { k: 'set', page }.
  import PrefsPage from './PrefsPage.svelte';
  import SyncPage from './SyncPage.svelte';
  import TrashPage from './TrashPage.svelte';
  import HistoryPage from './HistoryPage.svelte';
  import ArchivedPage from './ArchivedPage.svelte';
  import OrganizePage from './organize/OrganizePage.svelte';
  import ServerPage from './ServerPage.svelte';
  import PrivacyPage from './PrivacyPage.svelte';

  export let page: string;
</script>

{#if page === 'sync'}
  <SyncPage />
{:else if page === 'trash'}
  <TrashPage />
{:else if page === 'history'}
  <HistoryPage />
{:else if page === 'archived'}
  <ArchivedPage />
{:else if page === 'organize'}
  <OrganizePage />
{:else if page === 'server'}
  <ServerPage />
{:else if page === 'privacy'}
  <PrivacyPage />
{:else}
  <PrefsPage {page} />
{/if}
