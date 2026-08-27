import { EditorView, Decoration, type DecorationSet, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';

// Mirrors NotesBlock's old rendered-preview surface (marked -> the same
// ALLOWED_TAGS DOMPurify used to let through: strong/em/code/pre/ul/ol/li/
// h1-4/blockquote/a/del/hr) but applied as CodeMirror decorations instead
// of a second {@html} pane, so formatting shows inline while typing rather
// than only after switching to a separate preview mode.
const HEADING_LEVEL: Record<string, number> = {
  ATXHeading1: 1, ATXHeading2: 2, ATXHeading3: 3, ATXHeading4: 4, ATXHeading5: 4, ATXHeading6: 4,
};

const formatMark = Decoration.mark({ class: 'cm-md-mark' });
const strongMark = Decoration.mark({ class: 'cm-md-strong' });
const emphasisMark = Decoration.mark({ class: 'cm-md-em' });
const strikeMark = Decoration.mark({ class: 'cm-md-strike' });
const codeMark = Decoration.mark({ class: 'cm-md-code' });
const linkTextMark = Decoration.mark({ class: 'cm-md-link' });
const linkUrlMark = Decoration.mark({ class: 'cm-md-link-url' });
const quoteLine = Decoration.line({ class: 'cm-md-quote-line' });
const listMarkerMark = Decoration.mark({ class: 'cm-md-list-marker' });
const codeBlockLine = Decoration.line({ class: 'cm-md-codeblock-line' });
const hrMark = Decoration.mark({ class: 'cm-md-hr' });
const headingMark = (level: number) => Decoration.mark({ class: `cm-md-h cm-md-h${level}` });
const headingLine = (level: number) => Decoration.line({ class: `cm-md-h-line cm-md-h-line${level}` });

interface Entry { from: number; to: number; deco: Decoration }

function build(view: EditorView): DecorationSet {
  const entries: Entry[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from, to,
      enter(node) {
        const { name } = node.type;

        if (name in HEADING_LEVEL) {
          const level = HEADING_LEVEL[name];
          const line = view.state.doc.lineAt(node.from);
          entries.push({ from: line.from, to: line.from, deco: headingLine(level) });
          entries.push({ from: node.from, to: node.to, deco: headingMark(level) });
          return;
        }
        if (name === 'HeaderMark') { entries.push({ from: node.from, to: node.to, deco: formatMark }); return; }

        if (name === 'StrongEmphasis') { entries.push({ from: node.from, to: node.to, deco: strongMark }); return; }
        if (name === 'Emphasis') { entries.push({ from: node.from, to: node.to, deco: emphasisMark }); return; }
        if (name === 'Strikethrough') { entries.push({ from: node.from, to: node.to, deco: strikeMark }); return; }
        if (name === 'EmphasisMark' || name === 'StrikethroughMark') { entries.push({ from: node.from, to: node.to, deco: formatMark }); return; }

        if (name === 'InlineCode') { entries.push({ from: node.from, to: node.to, deco: codeMark }); return; }
        if (name === 'CodeMark') { entries.push({ from: node.from, to: node.to, deco: formatMark }); return; }

        if (name === 'FencedCode' || name === 'CodeBlock') {
          const startLine = view.state.doc.lineAt(node.from).number;
          const endLine = view.state.doc.lineAt(node.to).number;
          for (let l = startLine; l <= endLine; l++) {
            const line = view.state.doc.line(l);
            entries.push({ from: line.from, to: line.from, deco: codeBlockLine });
          }
          return;
        }
        if (name === 'CodeInfo') { entries.push({ from: node.from, to: node.to, deco: formatMark }); return; }

        if (name === 'Blockquote') {
          const startLine = view.state.doc.lineAt(node.from).number;
          const endLine = view.state.doc.lineAt(node.to).number;
          for (let l = startLine; l <= endLine; l++) {
            const line = view.state.doc.line(l);
            entries.push({ from: line.from, to: line.from, deco: quoteLine });
          }
          return;
        }
        if (name === 'QuoteMark') { entries.push({ from: node.from, to: node.to, deco: formatMark }); return; }

        if (name === 'ListMark') { entries.push({ from: node.from, to: node.to, deco: listMarkerMark }); return; }

        if (name === 'Link') {
          const marks = node.node.getChildren('LinkMark');
          const urlNode = node.node.getChild('URL');
          for (const m of marks) entries.push({ from: m.from, to: m.to, deco: formatMark });
          if (urlNode) entries.push({ from: urlNode.from, to: urlNode.to, deco: linkUrlMark });
          const textFrom = marks[0]?.to ?? node.from;
          const textTo = marks[1]?.from ?? node.to;
          if (textTo > textFrom) entries.push({ from: textFrom, to: textTo, deco: linkTextMark });
          return;
        }

        if (name === 'HorizontalRule') { entries.push({ from: node.from, to: node.to, deco: hrMark }); return; }
      },
    });
  }

  // Zero-length line decorations and non-zero mark decorations can share a
  // `from`; RangeSetBuilder only requires non-decreasing (from, to) pairs,
  // which sorting by from then to satisfies for both kinds at once.
  entries.sort((a, b) => a.from - b.from || a.to - b.to);

  const builder = new RangeSetBuilder<Decoration>();
  for (const e of entries) builder.add(e.from, e.to, e.deco);
  return builder.finish();
}

export function markdownLiveView() {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) { this.decorations = build(view); }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) {
          this.decorations = build(u.view);
        }
      }
    },
    { decorations: (v) => v.decorations },
  );
}
