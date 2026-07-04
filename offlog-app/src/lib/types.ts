// B22: used to be a fixed 'pc' | 'pc2' | 'mobile' enum — widened to a
// free-form per-device name (see config.ts's getDeviceName()/setDeviceName()),
// since a fixed 3-value set isn't enough once there's more than one PC or
// phone in play. Old docs may still literally contain 'pc'/'pc2'/'mobile'
// from before this widening — that's fine, they just display as their old
// literal value until next edited on that device.
export type Source = string;

export interface SpaceDoc {
  _id: string;          // "space:unsorted" | "space:personal" | "space:family" | "space:work"
  _rev?: string;
  type: 'space';
  name: string;
  color: string;
  position: number;
  updated_at: string;
  source: Source;
}

export interface Column {
  id: string;           // "col:<nanoid>"
  name: string;
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
  updated_at: string;
  source: Source;
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
  created_at: string;
  updated_at: string;
  source: Source;
}

export type AnyDoc = SpaceDoc | ProjectDoc | TaskDoc;
