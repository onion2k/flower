import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { compile } from '../dsl/index';
import { thumbnail } from './thumbnail';

/**
 * A strip of parts to start from, and symmetries to multiply them by.
 *
 * Each entry is a call written in the language. The thumbnail is built by
 * compiling that very text, so what the picture shows is what clicking it
 * writes into the sketch — and a part appears on screen at once, because the
 * click also places it in the form.
 */
interface PartEntry {
  name: string;
  call: string;
  material?: string;
}

export const PARTS: PartEntry[] = [
  { name: 'leaf', call: 'leaf(length: 30, width: 14, thickness: 1, piercings: 2, boss: 2)' },
  { name: 'petal', call: 'petal(length: 20, width: 12, thickness: 0.8, cup: 40deg, curl: 25deg)' },
  { name: 'wire', call: 'wire(path: spiral(start: 1.2, turns: 1.4, growth: 3), radius: 1.2, tip: 0.15)' },
  { name: 'blade', call: 'blade(path: bow(a: (-14, 0, 0), b: (14, 0, 0), sag: 6), width: 4, thickness: 0.8)' },
  { name: 'stem', call: 'stem(path: through((0, -18, 0), (2, -6, 0), (-2, 6, 0), (3, 16, 0)), radius: 1.5, nodes: 3)' },
  { name: 'branch', call: 'branch(path: through((0, -18, 0), (1, 0, 0), (0, 18, 0)), radius: 1.4, limbs: 3)' },
  { name: 'gem', call: 'gem(cut: brilliant, width: 8)', material: 'diamond' },
  { name: 'setting', call: 'setting(width: 8, style: claw, claws: 6)' },
  { name: 'pearl', call: 'pearl(radius: 5)', material: 'white pearl' },
  { name: 'bead', call: 'bead(radius: 4, point: 4)' },
  { name: 'egg', call: 'egg(radius: 10, height: 14, taper: 0.34)' },
  { name: 'pod', call: 'pod(length: 16, width: 8, whorls: 5, ribs: 8)' },
  { name: 'bud', call: 'bud(length: 14, width: 8, lobes: 5)' },
  { name: 'bell', call: 'bell(length: 12, mouth: 16, throat: 6)' },
  { name: 'rivet', call: 'rivet(head: 3.5, height: 1.2, shank: 2, grip: 1)' },
  { name: 'collar', call: 'collar(inner: 3, wall: 1, length: 3)' },
  { name: 'band', call: 'band(radius: 20, width: 3, thickness: 0.9)' },
  { name: 'bar', call: 'bar(length: 30, width: 5, thickness: 1.4)' },
  { name: 'disc', call: 'disc(radius: 9, thickness: 1.2, bore: 2)' },
  { name: 'gusset', call: 'gusset(radius: 9, thickness: 1.4)' },
];

export const SYMMETRIES: Array<{ name: string; call: string }> = [
  { name: 'ring', call: 'ring(8, radius: 20)' },
  { name: 'radial', call: 'radial(6)' },
  { name: 'dihedral', call: 'dihedral(6)' },
  { name: 'mirror', call: 'mirror()' },
  { name: 'helical', call: 'helical(12, radius: 10, rise: 3, turns: 2)' },
  { name: 'phyllotaxis', call: 'phyllotaxis(40, spacing: 3)' },
  { name: 'shell', call: 'shell(30, radius: 14)' },
  { name: 'along', call: 'along(path: circle(radius: 20), count: 12)' },
  { name: 'spray', call: 'spray(9, radius: 6, lean: 30deg)' },
  { name: 'nested', call: 'nested(4, factor: 0.7)' },
];

const TINTS: Record<string, [number, number, number]> = {
  diamond: [225, 232, 245],
  'white pearl': [242, 234, 218],
};

/** A name not yet declared in the sketch: leaf, then leaf2, leaf3. */
function freshName(doc: string, base: string): string {
  const taken = new Set([...doc.matchAll(/^\s*(?:part|let|unit|form)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm)].map((m) => m[1]));
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
}

/** Where a new part declaration goes: after the last one, else after the material line, else the top. */
function declarationPoint(view: EditorView): number {
  const doc = view.state.doc;
  let after = 0;
  let sawPart = false;
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (/^\s*part\s/.test(line.text)) { after = line.to; sawPart = true; }
    else if (!sawPart && /^\s*(material|use|let)\s/.test(line.text)) after = line.to;
  }
  return after;
}

/** The closing brace of the last form, or -1 when the sketch has none. */
function lastFormClose(view: EditorView): number {
  const text = view.state.doc.toString();
  let formAt = -1;
  for (const m of text.matchAll(/^\s*form\s+\w+\s*\{/gm)) formAt = m.index! + m[0].length;
  if (formAt < 0) return -1;
  const close = text.indexOf('\n}', formAt);
  return close < 0 ? -1 : close + 1;
}

function addPart(view: EditorView, entry: PartEntry) {
  const doc = view.state.doc.toString();
  const name = freshName(doc, entry.name);
  const declaration = `part ${name} = ${entry.call}${entry.material ? ` in ${entry.material}` : ''}`;
  const at = declarationPoint(view);
  const changes = [{ from: at, insert: at === 0 ? `${declaration}\n` : `\n${declaration}` }];
  let cursor: number;
  const close = lastFormClose(view);
  if (close >= 0) {
    changes.push({ from: close, insert: `  place ${name}\n` });
    cursor = close + changes[0].insert.length + 2;
  } else {
    const tail = doc.endsWith('\n') ? '' : '\n';
    const block = `${tail}\nform sketch {\n  place ${name}\n}\n`;
    changes.push({ from: doc.length, insert: block });
    cursor = doc.length + changes[0].insert.length + tail.length + '\nform sketch {\n  '.length;
  }
  view.dispatch({ changes, selection: EditorSelection.cursor(cursor), scrollIntoView: true });
  view.focus();
}

/**
 * Multiply: a `place x` line under the cursor becomes `repeat x around …`;
 * anywhere else, the most recent part is repeated at the end of the form.
 */
function addSymmetry(view: EditorView, call: string) {
  const state = view.state;
  const line = state.doc.lineAt(state.selection.main.head);
  const placed = line.text.match(/^(\s*)place\s+([a-zA-Z_][a-zA-Z0-9_]*)/);
  if (placed) {
    const insert = `${placed[1]}repeat ${placed[2]} around ${call}`;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert },
      selection: EditorSelection.cursor(line.from + insert.length),
    });
    view.focus();
    return;
  }
  const doc = state.doc.toString();
  const parts = [...doc.matchAll(/^\s*part\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm)];
  if (!parts.length) return;
  const name = parts[parts.length - 1][1];
  const close = lastFormClose(view);
  if (close < 0) return;
  const insert = `  repeat ${name} around ${call}\n`;
  view.dispatch({
    changes: { from: close, insert },
    selection: EditorSelection.cursor(close + insert.length - 1),
    scrollIntoView: true,
  });
  view.focus();
}

/** Build the strip into `host`. Thumbnails are drawn one per idle slot so the page comes up first. */
export function buildPalette(host: HTMLElement, view: EditorView) {
  const pending: Array<() => void> = [];
  for (const entry of PARTS) {
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.title = `${entry.call}${entry.material ? ` in ${entry.material}` : ''}\nclick to add it to the sketch`;
    const pic = document.createElement('div');
    pic.className = 'pic';
    const cap = document.createElement('span');
    cap.textContent = entry.name;
    tile.append(pic, cap);
    tile.addEventListener('click', () => addPart(view, entry));
    host.append(tile);
    pending.push(() => {
      const result = compile(`part x = ${entry.call}${entry.material ? ` in ${entry.material}` : ''}\nform f { place x }`);
      const placement = result.sketch?.assembly.placements[0];
      if (!placement) { pic.textContent = '?'; return; }
      pic.append(thumbnail(placement.part.mesh, 48, TINTS[entry.material ?? ''] ?? [201, 162, 39]));
    });
  }
  const rule = document.createElement('div');
  rule.className = 'rule';
  host.append(rule);
  for (const sym of SYMMETRIES) {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = sym.name;
    chip.title = `${sym.call}\nturns the "place" line under the cursor into a repeat, or repeats the last part`;
    chip.addEventListener('click', () => addSymmetry(view, sym.call));
    host.append(chip);
  }

  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    ?? ((cb: () => void) => window.setTimeout(cb, 16));
  const step = () => {
    const next = pending.shift();
    if (!next) return;
    next();
    idle(step);
  };
  idle(step);
}
