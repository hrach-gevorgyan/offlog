// The note editor (CodeMirror) is most of the phone's start-up JavaScript but
// is only needed on the task screen, so it is a separate chunk: fetched once
// the app has drawn (warmNoteEditor) and awaited by the task screen. Keep it
// out of every static import on the phone path, or it joins start-up again.
type EditorModule = typeof import('../carddetail/MarkdownEditor.svelte');

let loading: Promise<EditorModule> | null = null;

export function loadNoteEditor(): Promise<EditorModule> {
  // A failed load is forgotten so the next open tries again.
  loading ??= import('../carddetail/MarkdownEditor.svelte').catch(e => { loading = null; throw e; });
  return loading;
}

export function warmNoteEditor(): void {
  setTimeout(() => loadNoteEditor().catch(() => {}), 1500);
}
