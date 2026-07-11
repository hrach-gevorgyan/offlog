// B9 — command palette. Deliberately a small, fixed list of navigation/
// action shortcuts (not a plugin system) — matched against GlobalSearch's
// existing query box by plain substring on label+keywords, same matching
// style as searchAllTasks() (db.ts), no fuzzy library added for this.
export interface Command {
  id: string;
  label: string;
  keywords: string; // lowercase, space-separated extra match terms
  run: () => void;
}

export interface CommandContext {
  goToDashboard: () => void;
  goToFocus: () => void;
  goToAgenda: () => void;
  openQuickAdd: () => void;
  toggleTheme: () => void;
  toggleHighContrast: () => void;
  openSettings: () => void;
  openChangelog: () => void;
  openTrash: () => void;
  syncNow: () => void;
}

export function getCommands(ctx: CommandContext): Command[] {
  return [
    { id: 'dashboard', label: 'Go to Dashboard', keywords: 'home view', run: ctx.goToDashboard },
    { id: 'focus', label: 'Go to Focus', keywords: 'view commitment', run: ctx.goToFocus },
    { id: 'agenda', label: 'Go to Agenda', keywords: 'deadlines calendar view week', run: ctx.goToAgenda },
    { id: 'quickadd', label: 'Quick Add Task', keywords: 'new task create', run: ctx.openQuickAdd },
    { id: 'theme', label: 'Toggle Dark / Light Mode', keywords: 'appearance dark light theme', run: ctx.toggleTheme },
    { id: 'contrast', label: 'Toggle High Contrast', keywords: 'appearance accessibility', run: ctx.toggleHighContrast },
    { id: 'settings', label: 'Open Settings', keywords: 'preferences config organize sync notifications', run: ctx.openSettings },
    { id: 'changelog', label: 'Open Changelog', keywords: 'history activity log', run: ctx.openChangelog },
    { id: 'trash', label: 'Open Deleted', keywords: 'recycle bin restore trash', run: ctx.openTrash },
    { id: 'sync', label: 'Sync Now', keywords: 'refresh couchdb replicate', run: ctx.syncNow },
  ];
}
