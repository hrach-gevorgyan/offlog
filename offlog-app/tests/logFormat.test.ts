import { describe, expect, it } from 'vitest';
import { describeLog } from '../src/lib/logFormat';

describe('describeLog (regression: raw "deleted: Yes → No" instead of "Restored task", 2026-07-22)', () => {
  // Real bug: undoDelete() logs a single-field 'deleted' true->false
  // update (not the 'delete' action, which is reserved for the forward
  // delete). Without a special case, this fell through to the generic
  // field formatter and showed "deleted: Yes → No" verbatim in Time
  // Travel instead of readable text.
  it('formats a restored task as "Restored task <title>", not raw field text', () => {
    const text = describeLog({ field: 'deleted', from: true, to: false, task_title: 'Buy milk', ref: 'task:abc' });
    expect(text).toBe('Restored task "Buy milk"');
    expect(text).not.toMatch(/deleted/i);
    expect(text).not.toMatch(/Yes|No/);
  });

  it('still formats a forward delete via the delete action, not the field branch', () => {
    const text = describeLog({ action: 'delete', task_title: 'Buy milk', ref: 'task:abc' });
    expect(text).toBe('Deleted task "Buy milk"');
  });

  it('resolves entity type (project/space/field) from the ref prefix for a restored item', () => {
    expect(describeLog({ field: 'deleted', from: true, to: false, project_name: 'Work', ref: 'project:xyz' }))
      .toBe('Restored project "Work"');
  });
});

describe('describeLog: note edits, excerpted and full-body', () => {
  const ex = 'A'.repeat(120) + '…';

  it('reads an excerpted note edit as "Notes updated" even when both excerpts match', () => {
    expect(describeLog({ action: 'update', task_title: 'T', ref: 'task:1', diffs: { body: { from: ex, to: ex, changed: true } } }))
      .toBe('Notes updated on "T"');
  });

  it('reads an old entry holding both full bodies the same way, never echoing the text', () => {
    const text = describeLog({ action: 'update', task_title: 'T', ref: 'task:1',
      diffs: { body: { from: 'secret old body '.repeat(50), to: 'secret new body '.repeat(50) } } });
    expect(text).toBe('Notes updated on "T"');
  });

  it('shows a move that also edited the note', () => {
    expect(describeLog({ action: 'move', from: 'Idea', to: 'Task', task_title: 'T', ref: 'task:1',
      diffs: { body: { from: ex, to: ex, changed: true } } }))
      .toBe('Moved "T" from "Idea" → "Task" · Notes updated');
  });
});
