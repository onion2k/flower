import { autocompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete';
import { EditorSelection, type EditorState } from '@codemirror/state';
import { EditorView, showPanel } from '@codemirror/view';
import { BUILTIN_NAMES, PART_NAMES, type ParamInfo, signature } from '../dsl/builtins';

/**
 * Inline parameter help: a strip under the text that shows what the call
 * around the cursor takes, which of it has been given, and the defaults for
 * the rest. Click a parameter to write it in. Completions offer the same
 * names while typing, and the choices for a word parameter after its colon.
 *
 * Everything shown comes from the builtins' own argument reads (see
 * signature()), so it cannot drift from what the compiler accepts.
 */

interface Given {
  name?: string;
  text: string;
  from: number;
  to: number;
}

interface Call {
  callee: string;
  /** Position just after the opening paren. */
  open: number;
  /** Position of the closing paren, or where it would go. */
  close: number;
  args: Given[];
  /** Index into args of the one holding the cursor, if any. */
  current: number;
}

/** Comments and strings blanked to spaces, so brackets inside them do not count. */
function skeleton(state: EditorState): string {
  return state.doc.toString().replace(/#[^\n]*|"[^"\n]*"?/g, (m) => ' '.repeat(m.length));
}

/** The innermost builtin call the cursor is inside, if any. */
export function callAt(state: EditorState, pos: number): Call | null {
  const text = skeleton(state);
  let depth = 0;
  let open = -1;
  for (let i = pos - 1; i >= 0; i--) {
    const c = text[i];
    if (c === ')') depth++;
    else if (c === '(') {
      if (depth === 0) { open = i; break; }
      depth--;
    } else if (c === '{' || c === '}') break;
  }
  if (open < 0) return null;
  const head = text.slice(0, open).match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*$/);
  if (!head) return null;
  const callee = head[1];
  if (!signature(callee)) return null;

  const args: Given[] = [];
  let current = -1;
  let start = open + 1;
  depth = 0;
  let i = start;
  const push = (end: number) => {
    const raw = text.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    const from = start + lead;
    const body = raw.trim();
    const named = body.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/);
    if (body || pos >= start && pos <= end) {
      if (pos >= start && pos <= end) current = args.length;
      args.push({ name: named?.[1], text: body, from, to: from + body.length });
    }
  };
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') {
      if (depth === 0) break;
      depth--;
    } else if (c === '\n' && depth === 0 && /^\s*\n/.test(text.slice(i))) {
      // an unclosed call ends at a blank line rather than eating the sketch
      const rest = text.slice(i);
      if (/^\s*(part|unit|form|let|material|use)\b/.test(rest) || /^\n\s*\n/.test(rest)) break;
    } else if (c === '}' && depth === 0) break;
    else if (c === ',' && depth === 0) { push(i); start = i + 1; }
  }
  push(i);
  return { callee, open: open + 1, close: i, args, current };
}

/** Angles are stored in radians but written in degrees; these read better that way. */
const ANGLES = new Set(['tilt', 'phase', 'cup', 'curl', 'twist', 'lean', 'spin', 'limbAngle']);
const isAngle = (callee: string, p: ParamInfo) =>
  ANGLES.has(p.name) || (callee === 'arc' && (p.name === 'from' || p.name === 'to'));

function describeDefault(callee: string, p: ParamInfo): string {
  const v = p.fallback;
  if (p.kind === 'number') {
    if (typeof v !== 'number' || Number.isNaN(v)) return 'off';
    if (isAngle(callee, p)) return `${Math.round((v * 180) / Math.PI)}deg`;
    return String(Number(v.toPrecision(4)));
  }
  if (p.kind === 'flag') return v ? 'yes' : 'no';
  if (p.kind === 'word') return v === '' ? 'none' : String(v);
  return { point: 'point', path: 'path', symmetry: 'symmetry', points: 'points…' }[p.kind];
}

/** Something to write for a parameter that is not there yet. */
function starter(callee: string, p: ParamInfo): string {
  const v = p.fallback;
  switch (p.kind) {
    case 'number':
      // a default of zero or off means the feature is not there; writing the
      // default back in would change nothing, so start it at something visible
      if (typeof v !== 'number' || Number.isNaN(v) || v === 0) return isAngle(callee, p) ? '20deg' : '1';
      if (isAngle(callee, p)) return `${Math.round((v * 180) / Math.PI)}deg`;
      return String(Number(v.toPrecision(4)));
    case 'flag': return 'yes';
    case 'word': return v === '' ? (p.choices?.[0] ?? '') : String(v);
    case 'point': return '(0, 0, 0)';
    case 'points': return '(0, 0, 0), (10, 0, 5)';
    case 'path': return 'circle(radius: 10)';
    case 'symmetry': return 'ring(6, radius: 10)';
  }
}

/** Write `name: value` into the call, selecting the value so typing replaces it. */
function writeParam(view: EditorView, call: Call, p: ParamInfo) {
  const value = starter(call.callee, p);
  const last = call.args[call.args.length - 1];
  const at = last ? last.to : call.open;
  const lead = last ? ', ' : '';
  const insert = `${lead}${p.name}: ${value}`;
  const from = at + lead.length + p.name.length + 2;
  view.dispatch({
    changes: { from: at, insert },
    selection: EditorSelection.range(from, from + value.length),
  });
  view.focus();
}

function chip(text: string, cls: string, title?: string) {
  const el = document.createElement('span');
  el.className = `cm-help-chip ${cls}`;
  el.textContent = text;
  if (title) el.title = title;
  return el;
}

function render(view: EditorView, dom: HTMLElement) {
  dom.replaceChildren();
  const pos = view.state.selection.main.head;
  const call = callAt(view.state, pos);
  if (!call) {
    dom.append(chip(statementHint(view.state, pos), 'dim'));
    return;
  }
  const params = signature(call.callee)!;
  dom.append(chip(call.callee + '(', 'callee'));
  const positional = call.args.filter((a) => !a.name);
  params.forEach((p, index) => {
    const named = call.args.find((a) => a.name === p.name);
    const byPosition = !named && index < positional.length && positional[index].name === undefined
      && positional.slice(0, index + 1).every((a) => !a.name) ? positional[index] : undefined;
    const given = named ?? byPosition;
    const current = given && call.args[call.current] === given;
    let el: HTMLElement;
    if (given) {
      const value = given.name ? given.text.slice(given.name.length + 1).trim() : given.text;
      el = chip(`${p.name}: ${value.length > 18 ? value.slice(0, 16) + '…' : value}`, current ? 'given current' : 'given');
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        view.dispatch({ selection: EditorSelection.cursor(given.to) });
        view.focus();
      });
    } else {
      const fallback = describeDefault(call.callee, p);
      el = chip(p.required ? p.name : `${p.name} ${fallback}`, p.required ? 'missing' : 'absent',
        p.choices ? p.choices.join(', ') : `click to add ${p.name}`);
      el.addEventListener('mousedown', (e) => { e.preventDefault(); writeParam(view, call, p); });
    }
    dom.append(el);
  });
  dom.append(chip(')', 'callee'));
  const cur = call.args[call.current];
  const param = cur?.name ? params.find((p) => p.name === cur.name) : undefined;
  if (param?.choices) {
    dom.append(chip('·', 'dim'), chip(param.choices.join('  '), 'dim choices'));
  }
}

const MODIFIERS = ['at', 'turn', 'pitch', 'roll', 'scale', 'offset', 'flip', 'in', 'as'];

/** When the cursor is not in a call, say what the line could take instead. */
function statementHint(state: EditorState, pos: number): string {
  const line = state.doc.lineAt(pos).text.trim();
  const word = line.split(/\s+/)[0];
  if (word === 'place' || word === 'fasten') {
    const have = new Set(line.split(/\s+/));
    const rest = MODIFIERS.filter((m) => !have.has(m));
    return `${word} … ${rest.map((m) => m === 'at' ? 'at (x, y, z)' : m === 'in' ? 'in <metal> <finish>' : m === 'as' ? 'as <name>' : m === 'flip' ? 'flip' : `${m} <n>`).join(' · ')}`;
  }
  if (word === 'repeat') return 'repeat <part or unit> around ring · radial · dihedral · mirror · helical · phyllotaxis · shell · along · spray · nested · compose';
  if (word === 'part' && !line.includes('(')) return 'part <name> = ' + PART_NAMES.join(' · ');
  if (word === 'material' || /\bin\s+\w*$/.test(line)) return 'material <gold | silver | …> <polished | satin | …>';
  return 'parts · place · fasten · repeat — put the cursor inside a call to see its parameters';
}

const panel = showPanel.of((view) => {
  const dom = document.createElement('div');
  dom.className = 'cm-help';
  render(view, dom);
  return {
    dom,
    update(u) { if (u.docChanged || u.selectionSet) render(u.view, dom); },
  };
});

function complete(context: CompletionContext) {
  const word = context.matchBefore(/[a-zA-Z_][a-zA-Z0-9_]*|/);
  if (!word) return null;
  if (word.from === word.to && !context.explicit) return null;
  const call = callAt(context.state, word.from);
  let options: Completion[];
  if (call) {
    const params = signature(call.callee)!;
    const cur = call.args[call.current];
    const named = cur?.name ? params.find((p) => p.name === cur.name) : undefined;
    const afterColon = /:\s*[a-zA-Z_]*$/.test(context.state.sliceDoc(cur?.from ?? call.open, word.to));
    if (named && afterColon) {
      if (named.choices) {
        options = named.choices.map((c) => ({ label: c, type: 'enum' }));
      } else if (named.kind === 'path' || named.kind === 'symmetry') {
        options = BUILTIN_NAMES.filter((n) => isKind(n, named.kind)).map((n) => ({ label: n, type: 'function', apply: n + '(' }));
      } else if (named.kind === 'flag') {
        options = [{ label: 'yes' }, { label: 'no' }];
      } else return null;
    } else {
      const have = new Set(call.args.map((a) => a.name).filter(Boolean));
      options = params.filter((p) => !have.has(p.name)).map((p) => ({
        label: p.name,
        detail: p.required ? 'required' : describeDefault(call.callee, p),
        type: p.required ? 'keyword' : 'property',
        apply: `${p.name}: `,
        boost: p.required ? 1 : 0,
      }));
      const positional = params[call.current];
      if (positional && (positional.kind === 'path' || positional.kind === 'symmetry')) {
        options.push(...BUILTIN_NAMES.filter((n) => isKind(n, positional.kind))
          .map((n) => ({ label: n, type: 'function', apply: n + '(' })));
      }
    }
  } else {
    const before = context.state.sliceDoc(context.state.doc.lineAt(word.from).from, word.from);
    if (/=\s*$/.test(before)) {
      options = BUILTIN_NAMES.map((n) => ({ label: n, type: 'function', apply: n + '(' }));
    } else if (/\baround\s*$/.test(before)) {
      options = BUILTIN_NAMES.filter((n) => isKind(n, 'symmetry')).map((n) => ({ label: n, type: 'function', apply: n + '(' }));
    } else return null;
  }
  return { from: word.from, options, validFor: /^[a-zA-Z_][a-zA-Z0-9_]*$/ };
}

const CURVES = new Set(['spiral', 'arc', 'circle', 'helix', 'bezier', 'bow', 'through']);
const SYMMETRIES = new Set(['radial', 'ring', 'dihedral', 'mirror', 'helical', 'phyllotaxis', 'shell', 'along', 'spray', 'nested', 'compose']);
const isKind = (name: string, kind: string) =>
  kind === 'path' ? CURVES.has(name) : kind === 'symmetry' ? SYMMETRIES.has(name) : false;

const helpTheme = EditorView.theme({
  '.cm-panels': { backgroundColor: 'transparent', color: 'inherit' },
  '.cm-panels-bottom': { borderTop: '1px solid #2a2e35' },
  '.cm-help': { display: 'flex', flexWrap: 'wrap', gap: '3px 4px', padding: '5px 10px',
    fontSize: '11px', lineHeight: '1.5', minHeight: '28px', alignItems: 'center' },
  '.cm-help-chip': { padding: '0 5px', borderRadius: '3px', whiteSpace: 'nowrap' },
  '.cm-help-chip.callee': { color: '#7fc8d8', padding: '0' },
  '.cm-help-chip.given': { color: '#d8dce3', backgroundColor: '#1d2026', cursor: 'pointer' },
  '.cm-help-chip.current': { outline: '1px solid #c9a227' },
  '.cm-help-chip.absent': { color: '#6b7380', cursor: 'pointer' },
  '.cm-help-chip.absent:hover': { color: '#d8dce3', backgroundColor: '#1d2026' },
  '.cm-help-chip.missing': { color: '#e07a5f', cursor: 'pointer' },
  '.cm-help-chip.dim': { color: '#6b7380', padding: '0' },
  '.cm-help-chip.choices': { whiteSpace: 'normal' },
  '.cm-tooltip.cm-tooltip-autocomplete': { backgroundColor: '#16181c', border: '1px solid #2a2e35' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'inherit', fontSize: '11px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '2px 8px' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#2a2e35', color: '#d8dce3' },
  '.cm-completionDetail': { color: '#6b7380', fontStyle: 'normal', marginLeft: '1em' },
  '.cm-completionIcon': { display: 'none' },
});

export const parameterHelp = [
  panel,
  autocompletion({ override: [complete], icons: false, activateOnTyping: true }),
  helpTheme,
];
