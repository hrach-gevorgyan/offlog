<script lang="ts">
  // The task-pin star. One shared shape instead of the same polygon
  // hardcoded in CardDetail/KanbanBoard/ListView — keep all pin stars
  // visually identical by construction.
  export let size = 11;
  export let filled = true;
  export let stroked = false; // CardDetail's toggle button keeps an outline even when unfilled
</script>

<svg viewBox="0 0 16 16" width={size} height={size}
  fill={filled ? 'currentColor' : 'none'}
  stroke={stroked ? 'currentColor' : 'none'}
  stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <polygon points="8,1.5 9.8,6 14.5,6.3 11,9.4 12.1,14 8,11.3 3.9,14 5,9.4 1.5,6.3 6.2,6"/>
</svg>
