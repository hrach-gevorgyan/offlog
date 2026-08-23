// Command palette: deliberately a small, fixed list of navigation/action
// shortcuts, not a plugin system. Matched against GlobalSearch's existing
// query box by plain substring on label+keywords, the same matching style as
// searchAllTasks() in db.ts — no fuzzy-matching library.
export interface Command {
  id: string;
  label: string;
  keywords: string; // lowercase, space-separated extra match terms
  run: () => void;
  // True for commands whose run() opens another closeOnBack()-tracked
  // overlay (QuickAdd/Settings/Time Travel/Trash) rather than just navigating
  // or toggling a setting. GlobalSearch.svelte must close itself via
  // discardTop() rather than requestClose() for these: requestClose()'s real
  // history.back() races the new overlay's own pushState, and the new overlay
  // then never appears. See modalStack.ts's discardTop() comment.
  opensOverlay?: boolean;
}

export interface CommandContext {
  goToDashboard: () => void;
  goToFocus: () => void;
  goToAgenda: () => void;
  openQuickAdd: () => void;
  toggleTheme: () => void;
  toggleHighContrast: () => void;
  openSettings: () => void;
  openTimeTravel: () => void;
  openTrash: () => void;
  syncNow: () => void;
}

export function getCommands(ctx: CommandContext): Command[] {
  return [
    { id: 'dashboard', label: 'Go to Dashboard', keywords: 'home view', run: ctx.goToDashboard },
    { id: 'focus', label: 'Go to Focus', keywords: 'view commitment', run: ctx.goToFocus },
    { id: 'agenda', label: 'Go to Agenda', keywords: 'deadlines calendar view week', run: ctx.goToAgenda },
    { id: 'quickadd', label: 'Quick Add Task', keywords: 'new task create', run: ctx.openQuickAdd, opensOverlay: true },
    { id: 'theme', label: 'Toggle Dark / Light Mode', keywords: 'appearance dark light theme', run: ctx.toggleTheme },
    { id: 'contrast', label: 'Toggle High Contrast', keywords: 'appearance accessibility', run: ctx.toggleHighContrast },
    { id: 'settings', label: 'Open Settings', keywords: 'preferences config organize sync notifications', run: ctx.openSettings, opensOverlay: true },
    { id: 'timetravel', label: 'Open Time Travel', keywords: 'history activity log journal retrospective', run: ctx.openTimeTravel, opensOverlay: true },
    { id: 'trash', label: 'Open Deleted', keywords: 'recycle bin restore trash', run: ctx.openTrash, opensOverlay: true },
    { id: 'sync', label: 'Sync Now', keywords: 'refresh couchdb nyxdb replicate', run: ctx.syncNow },
  ];
}
