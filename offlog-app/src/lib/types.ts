export type Source = 'pc' | 'pc2' | 'mobile';

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
