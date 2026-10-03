import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import FilterSheet from '../src/lib/phone/project/FilterSheet.svelte';
import { EMPTY } from '../src/lib/phone/project/filter';
import type { CustomFieldDef, ProjectDoc, TaskDoc } from '../src/lib/types';

window.matchMedia = ((q: string) => ({
  matches: q.includes('reduce'), media: q, onchange: null,
  addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

afterEach(cleanup);

const project = { _id: 'project:p', name: 'House', columns: [{ id: 'c1', name: 'To do' }, { id: 'c2', name: 'Done' }] } as unknown as ProjectDoc;
const task = (id: string, custom_values: Record<string, unknown>) =>
  ({ _id: id, title: id, column_id: 'c1', priority: 1, tags: [], custom_values } as unknown as TaskDoc);
const fields = [
  { id: 'f1', name: 'Follow-up by', type: 'date' },
  { id: 'f2', name: 'Budget', type: 'number' },
] as unknown as CustomFieldDef[];

describe('phone FilterSheet', () => {
  it('shows a date field value in the app date format, other values as they are', () => {
    const { getByText, queryByText } = render(FilterSheet, {
      project, filter: { ...EMPTY, fields: [] }, customFields: fields,
      tasks: [task('task:a', { f1: '2030-10-06', f2: 4200 })],
    });
    expect(getByText('Sun 6 Oct 2030')).toBeTruthy();
    expect(queryByText('2030-10-06')).toBeNull();
    expect(getByText('4200')).toBeTruthy();
  });
});
