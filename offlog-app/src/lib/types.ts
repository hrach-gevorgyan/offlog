// B22: used to be a fixed 'pc' | 'pc2' | 'mobile' enum — widened to a
// free-form per-device name (see config.ts's getDeviceName()/setDeviceName()),
// since a fixed 3-value set isn't enough once there's more than one PC or
// phone in play. Old docs may still literally contain 'pc'/'pc2'/'mobile'
// from before this widening — that's fine, they just display as their old
// literal value until next edited on that device.
export type Source = string;

export interface SpaceDoc {
  // "space:unsorted" | "space:personal" | "space:work" (B24: default seed
  // is 3 spaces, not 4) | "space:family" (no longer seeded by default, but
  // still a valid id — old databases or a manually-recreated space can
  // still have one; Sidebar.svelte keeps its icon mapping for that reason
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

// v6.11.0 — optional per-tag color override. Tags themselves are still
// plain free-text on TaskDoc.tags (no schema change needed there) --
// this is a separate, tiny doc only for tags a user explicitly picked a
// color for, keyed directly by tag name (`tag:<name>`) since lookups are
// always by name, never a range scan. Absent = falls back to
// tagColors.ts's deterministic hash color.
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

// B16: a handful of typed fields per project, not a schema editor —
// deliberately just these 4 types, no nesting, no per-field validation
// rules. `options` only applies to `select`.
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
  // 'table' was valid before ListView/TableView merged (2026-07) — old
  // docs may still have it stored; App.svelte treats it as 'list' at
  // read time rather than migrating every doc. Not offered as a choice
  // for new writes.
  default_view: 'kanban' | 'list' | 'table';
  pinned?: boolean; // B34 — same always-sorts-to-top mechanism as TaskDoc.pinned
  archived?: boolean; // B32 — soft-archive; project stays, non-done tasks get archived: true too
  updated_at: string;
  source: Source;
}

// v6.8.0 — one entry per file attached to a task; see TaskDoc.attachments.
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
  // B12: when true, reminder_at is derived from due_date + config.ts's
  // getDefaultReminderTime() rather than set independently — CardDetail
  // recomputes it whenever due_date (or the default time) changes while
  // this is on. Optional/undefined on old docs = manual reminder, same as
  // always.
  remindOnDue?: boolean;
  // B16: keyed by CustomFieldDef.id, not name — a field rename doesn't
  // orphan existing values. Absent/undefined keys just render empty.
  custom_values?: Record<string, string | number | null>;
  // B18: a flat checklist, not nested/reorderable — deliberately simple.
  // Absent/undefined on old docs = no checklist, same as an empty array.
  checklist?: { text: string; done: boolean }[];
  // Recurring tasks: no interval/custom-days field on purpose (v1 scope —
  // "every N weeks" etc. can be added later if actually requested, not
  // designed for up front). Requires due_date to be meaningful; db.ts's
  // updateTask() falls back to "today" as the base if due_date is
  // missing rather than skip advancing, since a recurrence rule with
  // deleted due_date shouldn't silently stop repeating. Absent/undefined
  // on old docs = doesn't repeat, same as null.
  recurrence?: 'daily' | 'weekly' | 'monthly' | null;
  // v6.7.0 — task linking. Non-directional "related to" only (no blocks/
  // blocked-by dependency semantics — owner decision, 2026-07-28). Other
  // task ids this task names as related; stored forward-only on
  // whichever task the link was added from — see db.ts's
  // getRelatedTasks() for how the reverse direction is computed at read
  // time instead of mirror-written to both docs. Absent/undefined on old
  // docs = no links, same as an empty array.
  related?: string[];
  // v6.8.0 — file attachments. The actual bytes live in PouchDB's own
  // `_attachments` map (native attachment support -- rides the existing
  // sync/replication with zero new code, dedupes unchanged content by
  // digest automatically). This array is just small, loggable/diffable
  // metadata per attachment -- `key` is the matching key into
  // `_attachments`, not the filename, since two attachments could share
  // a filename. See attachments.ts for the format allowlist/size cap and
  // db.ts's addAttachment()/deleteAttachment() for the actual writes.
  attachments?: TaskAttachment[];
  created_at: string;
  updated_at: string;
  source: Source;
}
