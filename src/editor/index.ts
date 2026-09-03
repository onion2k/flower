import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { lintGutter, setDiagnostics } from '@codemirror/lint';
import { Annotation, EditorState } from '@codemirror/state';
import {
  drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers,
} from '@codemirror/view';
import type { CompileResult } from '../dsl/index';
import { sketchHighlighting, sketchLanguage } from './language';
import { scrubbing } from './scrub';

export interface SketchEditor {
  view: EditorView;
  get(): string;
  /** Replace the whole document, as when picking another sketch. Does not fire onChange. */
  set(source: string): void;
  /** Put the compile error in the gutter, or clear it. */
  report(result: CompileResult): void;
}

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: '#d8dce3',
    font: '12px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: 'inherit' },
  '.cm-content': { padding: '10px 0', caretColor: '#c9a227' },
  '.cm-line': { padding: '0 14px 0 6px' },
  '.cm-gutters': { backgroundColor: 'transparent', color: '#4a515c', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#838b98' },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.025)' },
  '.cm-cursor': { borderLeftColor: '#c9a227' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': { backgroundColor: 'rgba(201,162,39,0.22)' },
  '.cm-matchingBracket': { backgroundColor: 'rgba(201,162,39,0.18)', outline: 'none' },
  '.cm-lint-marker-error': { content: 'none' },
  '.cm-diagnostic-error': { borderLeftColor: '#e07a5f' },
  '.cm-lintRange-error': { backgroundImage: 'none', borderBottom: '1px dotted #e07a5f' },
  '.cm-tooltip': { backgroundColor: '#16181c', border: '1px solid #2a2e35', color: '#d8dce3' },
}, { dark: true });

/** Marks a wholesale swap of the document, which is not an edit the model should rebuild for. */
const replacing = Annotation.define<boolean>();

export function createEditor(parent: HTMLElement, doc: string, onChange: () => void): SketchEditor {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        lintGutter(),
        sketchLanguage,
        sketchHighlighting,
        scrubbing,
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorState.tabSize.of(2),
        theme,
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !u.transactions.some((t) => t.annotation(replacing))) onChange();
        }),
      ],
    }),
  });

  return {
    view,
    get: () => view.state.doc.toString(),
    set(source) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: source },
        annotations: replacing.of(true),
      });
    },
    report(result) {
      if (!result.error) { view.dispatch(setDiagnostics(view.state, [])); return; }
      const { line, column, message } = result.error;
      const l = view.state.doc.line(Math.min(line, view.state.doc.lines));
      const from = Math.min(l.from + column - 1, l.to);
      // the error span may be stale against a document that has moved on
      const to = Math.min(from + Math.max(result.error.end - result.error.start, 1), l.to);
      view.dispatch(setDiagnostics(view.state, [{ from, to: Math.max(to, from), severity: 'error', message }]));
    },
  };
}
