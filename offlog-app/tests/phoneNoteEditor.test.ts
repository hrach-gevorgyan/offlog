import { describe, it, expect, vi } from 'vitest';

let attempts = 0;
vi.mock('../src/lib/carddetail/MarkdownEditor.svelte', () => {
  attempts++;
  if (attempts === 1) throw new Error('chunk failed');
  return { default: 'Editor' };
});

describe('loadNoteEditor', () => {
  it('a failed load is retried on the next open, then shared', async () => {
    const { loadNoteEditor } = await import('../src/lib/phone/noteEditor');
    await expect(loadNoteEditor()).rejects.toThrow();
    vi.resetModules();
    const mod = await loadNoteEditor();
    expect(mod.default).toBe('Editor');
    expect(attempts).toBe(2);
    expect(loadNoteEditor()).toBe(loadNoteEditor());
  });
});
