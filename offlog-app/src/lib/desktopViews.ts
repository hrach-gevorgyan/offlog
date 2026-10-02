// The desktop views, as one chunk App.svelte imports dynamically so a phone
// never downloads or parses them. Nothing may import this module statically:
// that would pull every desktop view back into the main bundle.
export { default as Sidebar } from './Sidebar.svelte';
export { default as KanbanBoard } from './KanbanBoard.svelte';
export { default as ListView } from './ListView.svelte';
export { default as AgendaView } from './AgendaView.svelte';
export { default as FocusView } from './FocusView.svelte';
export { default as DashboardView } from './DashboardView.svelte';
export { default as GlobalSearch } from './GlobalSearch.svelte';
export { default as FilterBar } from './FilterBar.svelte';
export { default as CardDetail } from './CardDetail.svelte';
export { default as QuickAdd } from './QuickAdd.svelte';
