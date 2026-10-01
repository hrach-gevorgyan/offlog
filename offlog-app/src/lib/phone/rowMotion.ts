// Which list rows animate when they leave or come back. Only a task the user
// just finished (or un-finished) collapses out of its list, and only one
// whose finish was undone grows back in; a row removed by a filter, a search
// or a sync goes at once. The lists read these as their collapseOut /
// collapseIn `on` parameter, which Svelte evaluates when the transition starts.
//
// A mark is consumed by the first read. One never read (the task stayed in
// the list) lapses after a moment, so it cannot animate some later,
// unrelated removal of the same row.
const leaving = new Map<string, number>();
const returning = new Map<string, number>();
const LAPSE_MS = 2000;

function take(marks: Map<string, number>, id: string): boolean {
  const at = marks.get(id);
  marks.delete(id);
  return at !== undefined && Date.now() - at < LAPSE_MS;
}

export const markLeaving = (id: string) => { leaving.set(id, Date.now()); };
export const markReturning = (id: string) => { returning.set(id, Date.now()); };
export const leaves = (id: string): boolean => take(leaving, id);
export const returns = (id: string): boolean => take(returning, id);
