// A free-form per-device name (see config.ts's getDeviceName()/
// setDeviceName()). Old docs may literally contain 'pc'/'pc2'/'mobile' from
// an earlier fixed enum — they simply display as that literal value until
// next edited on that device.
export type Source = string;

export interface SpaceDoc {
  // "space:unsorted" | "space:personal" | "space:work" (the default seed) |
  // "space:family" (not seeded, but still a valid id — old databases or a
  // manually-recreated space can have one; Sidebar.svelte keeps its icon
  // mapping for that reason
  _id: string;
  _rev?: string;
  type: 'space';
  name: string;
  color: string;
  icon?: string; // key into spaceIcons.ts's SPACE_ICONS; absent = legacy/default fallback
  position: number;
  updated_at: string;
  source: Source;
}

// Optional per-tag color override. Tags themselves are plain free-text on
// TaskDoc.tags; this is a separate, tiny doc written only for tags a user
// explicitly picked a color for, keyed directly by tag name (`tag:<name>`)
// since lookups are always by name, never a range scan. Absent = falls back
// to tagColors.ts's deterministic hash color.
export interface TagColorDoc {
  _id: string;          // "tag:<tag-name>"
  _rev?: string;
  type: 'tag_color';
  tag: string;
  color: string;
  updated_at: string;
  source: Source;
}

export interface Column {
  id: string;           // "col:<nanoid>"
  name: string;
}

// A handful of typed fields per project, not a schema editor — deliberately
// just these 4 types, no nesting, no per-field validation rules. `options`
// only applies to `select`.
export interface CustomFieldDef {
  id: string;            // "field:<nanoid>"
  name: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[];
}

export interface ProjectDoc {
  _id: string;          // "project:<nanoid>"
  _rev?: string;
  type: 'project';
  space_id: string;
  name: string;
  position: number;
  columns: Column[];
  // 'table' is a legacy value some docs still carry; App.svelte treats it as
  // 'list' at read time rather than migrating every doc. Not offered as a
  // choice for new writes.
  default_view: 'kanban' | 'list' | 'table';
  pinned?: boolean; // same always-sorts-to-top mechanism as TaskDoc.pinned
  archived?: boolean; // soft-archive; project stays, non-done tasks get archived: true too
  updated_at: string;
  source: Source;
}

// One entry per file attached to a task; see TaskDoc.attachments.
export interface TaskAttachment {
  key: string;           // "att:<nanoid>" -- the key into the doc's PouchDB _attachments map
  filename: string;
  content_type: string;
  size: number;          // bytes, after any client-side downscale/compression
  added_at: string;
}

export interface TaskDoc {
  _id: string;          // "task:<nanoid>"
  _rev?: string;
  type: 'task';
  project_id: string;
  space_id: string;
  column_id: string;
  title: string;
  body: string;
  priority: 1 | 2 | 3;
  due_date: string | null;
  reminder_at: string | null;
  tags: string[];
  position: number;
  deleted: boolean;
  pinned?: boolean;
  archived?: boolean;
  // Set only by archiveProject()'s cascade, so unarchiveProject() can restore
  // exactly the tasks it hid and no others. Without it the two are asymmetric
  // -- archiving hid every open task, un-archiving restored none, and the
  // project came back empty despite the UI promising "hidden until restored".
  // Blindly restoring every archived task instead would resurrect ones the
  // user had archived individually on purpose, which is the whole reason this
  // needs recording rather than inferring.
  // Absent/undefined = archived on its own, same as always. Tasks hidden by a
  // cascade that ran before this field existed cannot be told apart, so they
  // stay archived and must be restored by hand.
  archivedWithProject?: boolean;
  // When true, reminder_at is derived from due_date + config.ts's
  // getDefaultReminderTime() rather than set independently — CardDetail
  // recomputes it whenever due_date (or the default time) changes while
  // this is on. Optional/undefined on old docs = manual reminder, same as
  // always.
  remindOnDue?: boolean;
  // Keyed by CustomFieldDef.id, not name — a field rename doesn't
  // orphan existing values. Absent/undefined keys just render empty.
  custom_values?: Record<string, string | number | null>;
  // A flat checklist, not nested or reorderable — deliberately simple.
  // Absent/undefined on old docs = no checklist, same as an empty array.
  checklist?: { text: string; done: boolean }[];
  // Recurring tasks. Requires due_date to be meaningful; db.ts's
  // updateTask() falls back to "today" as the base if due_date is
  // missing rather than skip advancing, since a recurrence rule with
  // deleted due_date shouldn't silently stop repeating. Absent/undefined
  // on old docs = doesn't repeat, same as null.
  recurrence?: 'daily' | 'weekly' | 'monthly' | null;
  // Custom recurrence interval — every N days/weeks/months instead of
  // always N=1. Absent/undefined means 1. Only meaningful alongside
  // `recurrence`; ignored when that's null.
  recurrenceInterval?: number;
  // "Weekdays only" — daily recurrence that skips Saturday/Sunday when
  // advancing. Only meaningful alongside `recurrence: 'daily'`.
  // Absent/undefined = false.
  recurrenceWeekdaysOnly?: boolean;
  // Task linking: non-directional "related to" only, deliberately carrying
  // no blocks/blocked-by dependency semantics (see `blocked_by` below for
  // that). Other task ids this task names as related, stored forward-only on
  // whichever task the link was added from — see db.ts's getRelatedTasks()
  // for how the reverse direction is computed at read time instead of
  // mirror-written to both docs. Absent/undefined = no links.
  related?: string[];
  // A real dependency, unlike `related` above: this task can't start until
  // every task named here is done. Directional (stored only on the blocked
  // task, never mirrored onto the blocker) and deliberately kept separate
  // from `related` rather than overloading it with dependency semantics.
  // "Done" is computed at read time the way it is everywhere else —
  // column_id equal to the blocker's own project's last column — not a
  // stored boolean, so it can never drift out of sync with the blocker's
  // actual status. Absent/undefined = no dependencies.
  blocked_by?: string[];
  // File attachments. The actual bytes live in PouchDB's own
  // `_attachments` map (native attachment support -- rides the existing
  // sync/replication with zero new code, dedupes unchanged content by
  // digest automatically). This array is just small, loggable/diffable
  // metadata per attachment -- `key` is the matching key into
  // `_attachments`, not the filename, since two attachments could share
  // a filename. See attachments.ts for the size cap and
  // db.ts's addAttachment()/deleteAttachment() for the actual writes.
  attachments?: TaskAttachment[];
  created_at: string;
  updated_at: string;
  source: Source;
}
