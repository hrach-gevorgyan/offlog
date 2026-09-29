import { describe, expect, it, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';

// The notes editor is the one place the app hands a live CodeMirror
// instance real user text, and it had no test at all — so a CodeMirror
// bump could break note editing while every other gate stayed green.
// These assert the wiring across the four @codemirror/* packages the
// component composes (view, state, commands, lang-markdown), not
// CodeMirror's own behaviour.
import MarkdownEditor from '../src/lib/carddetail/MarkdownEditor.svelte';

afterEach(cleanup);

describe('MarkdownEditor', () => {
  it('mounts a CodeMirror editor showing the initial value', () => {
    const { container } = render(MarkdownEditor, { value: '# Heading\n- item' });

    const editor = container.querySelector('.cm-editor');
    expect(editor).toBeTruthy();
    // contenteditable is what makes it typable at all — a mounted-but-dead
    // editor would still match .cm-editor.
    expect(editor!.querySelector('.cm-content[contenteditable="true"]')).toBeTruthy();
    expect(editor!.textContent).toContain('# Heading');
    expect(editor!.textContent).toContain('- item');
  });

  it('renders the placeholder when empty', () => {
    const { container } = render(MarkdownEditor, { value: '', placeholderText: 'Notes…' });

    expect(container.querySelector('.cm-placeholder')?.textContent).toBe('Notes…');
  });

  // markdownLiveView() styles markdown in place instead of rendering it to
  // HTML (see its own comment) — the decorations are the formatting the
  // user sees while typing, so losing them is a silent regression.
  it('decorates markdown syntax in place rather than producing HTML', () => {
    const { container } = render(MarkdownEditor, { value: '**bold**' });

    const editor = container.querySelector('.cm-editor')!;
    expect(editor.querySelector('.cm-md-strong')).toBeTruthy();
    // the source characters stay put; nothing is converted to a <strong>
    expect(editor.textContent).toContain('**bold**');
    expect(editor.querySelector('strong')).toBeNull();
  });
});
