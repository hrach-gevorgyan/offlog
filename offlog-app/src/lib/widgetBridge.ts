import { registerPlugin } from '@capacitor/core';
import { getAllTasksDue } from './db';
import type { ProjectDoc } from './types';
import { dueRelative } from './utils';

// OffologWidgetPlugin.java (app-local, not an npm package — registered
// directly in MainActivity per Capacitor's custom-native-plugin pattern)
// bridges this data to the two read-only home-screen widgets (ROADMAP.md
// B20 Agenda, B31 Project list). No-op object on web; isNative() below
// gates every call so registerPlugin() itself never has to resolve a real
// native implementation there.
interface OffologWidgetPlugin {
  updateAgenda(options: { items: string }): Promise<void>;
  updateProjects(options: { items: string }): Promise<void>;
}
const OffologWidget = registerPlugin<OffologWidgetPlugin>('OffologWidget');

const isNative = () => !!(window as any).Capacitor?.isNativePlatform?.();

// Called from store.ts's reload() — same place rescheduleAll() already
// runs from, on init and every live sync/local change — so both widgets
// stay current without their own polling loop (there's nothing for a
// native poll to read that isn't already sitting in SharedPreferences
// from the last time this ran; see OffologWidgetPlugin's own comment).

export async function updateAgendaWidget(): Promise<void> {
  if (!isNative()) return;
  const due = await getAllTasksDue();
  const items = due.slice(0, 3).map(t => ({ title: t.title, due: dueRelative(t.due_date!) }));
  await OffologWidget.updateAgenda({ items: JSON.stringify(items) }).catch(() => {});
}

export async function updateProjectsWidget(projects: ProjectDoc[]): Promise<void> {
  if (!isNative()) return;
  const items = projects.slice(0, 4).map(p => ({ id: p._id, name: p.name }));
  await OffologWidget.updateProjects({ items: JSON.stringify(items) }).catch(() => {});
}
