import { EditorSelection, type EditorState } from '@codemirror/state';
import { EditorView, keymap, ViewPlugin } from '@codemirror/view';

/**
 * Number scrubbing: hold alt and drag a literal sideways to change it, with the
 * model rebuilding as it goes. Alt with the up and down arrows nudges the
 * literal under the cursor by one step.
 *
 * The step comes from how the number was written: `34` moves by ones, `1.1` by
 * tenths, `0.28` by hundredths. Shift makes the step ten times larger, and the
 * platform modifier ten times smaller, adding a decimal place. So the precision
 * of a value is something the writer states by typing it, and scrubbing keeps
 * whatever they chose. A unit suffix rides along untouched.
 */

/** Digits with optional unit, and a leading minus when it is a sign rather than a subtraction. */
const NUMBER = /-?(?:\d+\.?\d*|\.\d+)[a-zA-Z]*/g;

interface Literal {
  from: number;
  to: number;
  value: number;
  decimals: number;
  unit: string;
}

export function literalAt(state: EditorState, pos: number): Literal | null {
  const line = state.doc.lineAt(pos);
  const text = line.text;
  NUMBER.lastIndex = 0;
  for (let m = NUMBER.exec(text); m; m = NUMBER.exec(text)) {
    let start = m.index;
    let raw = m[0];
    if (raw.startsWith('-')) {
      // "x - 2" is a subtraction, "(-2, 0)" and "turn -29deg" are signs
      const before = text.slice(0, start).trimEnd();
      const isSign = before === '' || /[(,:=+\-*\/]$/.test(before) || /[a-zA-Z_]$/.test(before);
      if (!isSign) { start++; raw = raw.slice(1); }
    }
    const from = line.from + start;
    const to = from + raw.length;
    if (pos < from || pos > to) continue;
    const digits = raw.match(/-?[\d.]+/)![0];
    if (digits === '-' || digits === '.') return null;
    const unit = raw.slice(digits.length);
    const dot = digits.indexOf('.');
    return {
      from, to,
      value: Number(digits),
      decimals: dot < 0 ? 0 : digits.length - dot - 1,
      unit,
    };
  }
  return null;
}

function stepFor(decimals: number, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
  const fine = e.metaKey || e.ctrlKey;
  const magnitude = decimals + (fine ? 1 : 0) - (e.shiftKey ? 1 : 0);
  return { step: Math.pow(10, -magnitude), decimals: Math.max(magnitude, 0) };
}

function format(value: number, decimals: number, unit: string) {
  const text = value.toFixed(decimals);
  // -0.0 is a scrubbing artefact, not a value anyone wrote
  return (Number(text) === 0 ? text.replace('-', '') : text) + unit;
}

/** Replace a literal, returning where it now ends so the next change can follow it. */
function replace(view: EditorView, lit: Literal, value: number, decimals: number) {
  const insert = format(value, decimals, lit.unit);
  view.dispatch({
    changes: { from: lit.from, to: lit.to, insert },
    selection: EditorSelection.single(lit.from, lit.from + insert.length),
    userEvent: 'scrub',
  });
  return { ...lit, to: lit.from + insert.length, value, decimals };
}

/** Pixels of travel per step. Coarse enough that a value can be held still. */
const PIXELS_PER_STEP = 4;

const dragToScrub = EditorView.domEventHandlers({
  mousedown(e, view) {
    if (!e.altKey || e.button !== 0) return false;
    const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos === null) return false;
    let lit = literalAt(view.state, pos);
    if (!lit) return false;
    e.preventDefault();

    const origin = e.clientX;
    const startValue = lit.value;
    let lastSteps = 0;
    view.dom.classList.add('cm-scrubbing');

    const move = (ev: MouseEvent) => {
      const { step, decimals } = stepFor(lit!.decimals, ev);
      const steps = Math.round((ev.clientX - origin) / PIXELS_PER_STEP);
      if (steps === lastSteps && decimals === lit!.decimals) return;
      lastSteps = steps;
      // the step is re-read every move so shift can be pressed mid-drag, but the
      // value is always start + travel, so releasing shift does not jump
      const value = startValue + steps * step;
      lit = replace(view, lit!, value, Math.max(decimals, lit!.decimals));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      view.dom.classList.remove('cm-scrubbing');
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return true;
  },
});

function nudge(direction: 1 | -1) {
  return (view: EditorView) => {
    const lit = literalAt(view.state, view.state.selection.main.head);
    if (!lit) return false;
    const { step, decimals } = stepFor(lit.decimals, { shiftKey: false, metaKey: false, ctrlKey: false });
    replace(view, lit, lit.value + direction * step, decimals);
    return true;
  };
}

function nudgeBy(direction: 1 | -1, factor: 10 | 0.1) {
  return (view: EditorView) => {
    const lit = literalAt(view.state, view.state.selection.main.head);
    if (!lit) return false;
    const mods = { shiftKey: factor === 10, metaKey: factor === 0.1, ctrlKey: false };
    const { step, decimals } = stepFor(lit.decimals, mods);
    replace(view, lit, lit.value + direction * step, Math.max(decimals, lit.decimals));
    return true;
  };
}

const nudgeKeys = keymap.of([
  { key: 'Alt-ArrowUp', run: nudge(1) },
  { key: 'Alt-ArrowDown', run: nudge(-1) },
  { key: 'Shift-Alt-ArrowUp', run: nudgeBy(1, 10) },
  { key: 'Shift-Alt-ArrowDown', run: nudgeBy(-1, 10) },
  { key: 'Mod-Alt-ArrowUp', run: nudgeBy(1, 0.1) },
  { key: 'Mod-Alt-ArrowDown', run: nudgeBy(-1, 0.1) },
]);

/** While alt is down the numbers show a resize cursor, so the affordance is discoverable. */
const altCursor = ViewPlugin.fromClass(class {
  constructor(private view: EditorView) {
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
  }
  onKey = (e: KeyboardEvent) => this.view.dom.classList.toggle('cm-alt', e.altKey);
  onBlur = () => this.view.dom.classList.remove('cm-alt');
  destroy() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
  }
});

const scrubTheme = EditorView.theme({
  '&.cm-alt .tok-number, &.cm-alt .ͼnumber': { cursor: 'ew-resize' },
  '&.cm-alt .cm-content': { cursor: 'default' },
  '&.cm-scrubbing, &.cm-scrubbing *': { cursor: 'ew-resize !important', userSelect: 'none' },
});

export const scrubbing = [dragToScrub, nudgeKeys, altCursor, scrubTheme];
