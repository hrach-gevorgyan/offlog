<script lang="ts">
  export let openSpaceManager: () => void;
  export let openTagManager: () => void;
  export let openCustomFieldManager: () => void;
  export let openArchivedProjectsManager: () => void;
</script>

              <div class="setting-group">
                <div class="setting-section-title">Workspace</div>
                <button class="link-row link-row-compact" on:click={openSpaceManager}>
                  <span class="link-row-title">Spaces</span>
                  <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
                </button>
                <p class="setting-hint compact-hint">The top-level groups your projects live in, shown in the sidebar — Personal and Work by default.</p>
                <button class="link-row link-row-compact" on:click={openTagManager}>
                  <span class="link-row-title">Tags</span>
                  <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
                </button>
                <p class="setting-hint compact-hint">Rename tags or fix their colors — changes apply everywhere that tag is used.</p>
                <button class="link-row link-row-compact" on:click={openCustomFieldManager}>
                  <span class="link-row-title">Custom Fields</span>
                  <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
                </button>
                <p class="setting-hint compact-hint">Custom field definitions are shared across every project — a field created here shows up on every task, everywhere.</p>
                <button class="link-row link-row-compact" on:click={openArchivedProjectsManager}>
                  <span class="link-row-title">Archived Projects</span>
                  <svg viewBox="0 0 8 14" width="7" height="12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="1,1 7,7 1,13"/></svg>
                </button>
                <p class="setting-hint compact-hint">Restore a project you archived, or delete it for good.</p>
              </div>

