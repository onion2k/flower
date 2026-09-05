import type { ConnectivityRequest, ConnectivityResponse } from './assembly/connectivity.worker';
import { catalogue, catalogueGroups, catalogueNames } from './spike/catalogue';
import { examples, exampleGroups, exampleNames } from './dsl/examples';
import { compile } from './dsl/index';
import { metalNames, finishNames } from './render/materials';
import type { EnvPreset } from './render/env';
import { forms, formNames } from './spike/forms';
import { Assembly } from './assembly/assembly';
import { identity } from './geom/transform';
import type { Anchor, Engraving, Inscription, Part, PlateRelief } from './parts/types';
import type { Placement } from './assembly/assembly';
import type { Span } from './dsl/lexer';
import type { Mesh } from './mesh/types';
import { Viewer, tableNames, type Quality, type RigLight, type TableName } from './render/viewer';
import { meanRadiance, parseHdr } from './render/hdr';
import { createEditor } from './editor/index';
import { buildPalette } from './editor/palette';
import { sketchNames } from './editor/help';
import { store } from './editor/store';

const stage = document.getElementById('stage')!;
const controlsEl = document.getElementById('controls')!;
const statsEl = document.getElementById('stats')!;
const budgetEl = document.getElementById('budget')!;

const editorPane = document.getElementById('editor')!;
const diagnosticEl = document.getElementById('diagnostic')!;
const diagnosticText = document.createElement('span');
const diagnosticHint = document.createElement('span');
diagnosticHint.className = 'hint';
diagnosticHint.textContent = navigator.platform.startsWith('Mac')
  ? '⌥ drag a number to scrub · ⌥↑↓ nudge · ⇧ coarser · ⌘ finer'
  : 'alt drag a number to scrub · alt↑↓ nudge · shift coarser · ctrl finer';
diagnosticEl.append(diagnosticText, diagnosticHint);

let viewer: Viewer;
try {
  viewer = await Viewer.create(stage, (info) => {
    diagnosticText.textContent = `GPU device lost (${info.reason}): ${info.message || 'the GPU timed out'} — reload the page`;
    diagnosticEl.classList.add('bad');
  });
} catch (err) {
  diagnosticText.textContent = `renderer unavailable: ${(err as Error).message}`;
  diagnosticEl.classList.add('bad');
  throw err;
}

/**
 * The studio rig, as presets set round the key: each takes the key's
 * azimuth and strength and returns the lights beside it. A fill is broad,
 * low and cool on the far side, at a fraction of the key, to open the
 * shadows without casting one of its own to speak of; a rim is small and
 * behind, opposite the key, to draw a bright line round the piece's edge.
 */
const RIGS: Record<string, (azimuth: number, strength: number) => RigLight[]> = {
  none: () => [],
  fill: (a, k) => [
    { elevation: 0.35, azimuth: a + 2.0, strength: 0.3 * k, warmth: -0.25, size: 0.45 },
  ],
  rim: (a, k) => [
    { elevation: 0.65, azimuth: a + Math.PI, strength: 0.9 * k, warmth: 0.1, size: 0.05 },
  ],
  'three point': (a, k) => [
    { elevation: 0.35, azimuth: a + 2.0, strength: 0.3 * k, warmth: -0.25, size: 0.45 },
    { elevation: 0.65, azimuth: a + Math.PI, strength: 0.9 * k, warmth: 0.1, size: 0.05 },
  ],
  clamshell: (a, k) => [
    { elevation: 0.15, azimuth: a, strength: 0.4 * k, warmth: 0, size: 0.5 },
    { elevation: 0.7, azimuth: a - 2.4, strength: 0.6 * k, warmth: 0.15, size: 0.08 },
    { elevation: 0.7, azimuth: a + 2.4, strength: 0.6 * k, warmth: 0.15, size: 0.08 },
  ],
};
type RigName = keyof typeof RIGS;

const state = {
  subject: formNames[0],
  metal: 'gold',
  finish: 'polished',
  environment: 'studio' as EnvPreset | 'image',
  table: 'matte' as TableName,
  exposure: 1,
  bloom: 0.018,
  glow: 1,
  detail: 0.6,
  contact: 1,
  tonemap: 'agx' as 'agx' | 'aces',
  vignette: 0.3,
  grain: 0.25,
  fringe: 0.3,
  envSpin: 0,
  background: '#0b0c0e',
  keyElevation: Math.PI / 4,
  keyAzimuth: -Math.PI / 4,
  keyStrength: 1,
  keyWarmth: 0.3,
  keySize: 0.08,
  rig: 'none' as RigName,
  // the sky as baked is brighter than the key at its default, and lights the
  // piece like an overcast day: turned down, the key gives it a side and the
  // table stays dark, which is the studio look the examples were drawn for
  envStrength: 0.3,
  dof: 0,
  focus: 1,
  lens: 42,
  tilt: 0,
  shiftX: 0,
  shiftY: 0,
  debug: 0,
  showAnchors: false,
  renderScale: 1,
  quality: 'draft' as Quality,
};

let framed = '';

function toggle(label: string, key: 'showAnchors', onChange: () => void) {
  const wrap = document.createElement('label');
  wrap.className = 'check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = state[key];
  input.addEventListener('change', () => {
    state[key] = input.checked;
    onChange();
  });
  wrap.append(input, document.createTextNode(label));
  return wrap;
}

function picker(
  label: string, names: readonly string[], value: string,
  onPick: (v: string) => void, register?: (sel: HTMLSelectElement) => void,
) {
  const wrap = document.createElement('label');
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<span>${label}</span>`;
  const sel = document.createElement('select');
  for (const n of names) {
    const opt = document.createElement('option');
    opt.value = n;
    opt.textContent = n;
    sel.append(opt);
  }
  sel.value = value;
  sel.addEventListener('change', () => onPick(sel.value));
  register?.(sel);
  wrap.append(row, sel);
  return wrap;
}

function colour(label: string, value: string, onInput: (hex: string) => void) {
  const wrap = document.createElement('label');
  const row = document.createElement('div');
  row.className = 'row';
  const name = document.createElement('span');
  name.textContent = label;
  const val = document.createElement('b');
  val.textContent = value;
  row.append(name, val);
  const input = document.createElement('input');
  input.type = 'color';
  input.value = value;
  input.addEventListener('input', () => {
    val.textContent = input.value;
    onInput(input.value);
  });
  wrap.append(row, input);
  return wrap;
}

const hexToRgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

function slider(
  label: string, min: number, max: number, step: number, value: number,
  fmt: (v: number) => string, onInput: (v: number) => void,
  register?: (set: (v: number) => void) => void,
) {
  const wrap = document.createElement('label');
  const row = document.createElement('div');
  row.className = 'row';
  const name = document.createElement('span');
  name.textContent = label;
  const val = document.createElement('b');
  val.textContent = fmt(value);
  row.append(name, val);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min); input.max = String(max); input.step = String(step);
  input.value = String(value);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    val.textContent = fmt(v);
    onInput(v);
  });
  // something else may move the value — a drag on the canvas moves the camera — and the slider follows
  register?.((v) => {
    if (document.activeElement === input) return;
    input.value = String(v);
    val.textContent = fmt(v);
  });
  wrap.append(row, input);
  return wrap;
}

const subjectSet = document.createElement('fieldset');
subjectSet.innerHTML = '<legend>Subject</legend>';
const select = document.createElement('select');

/**
 * The dropdown: the writer's own sketches first, then what ships with the
 * page, grouped by what it is. An option's value stays `kind:name` whatever
 * group it sits under — the group is for the eye, the kind is what
 * `sourceFor` and the store go by.
 */
function fillSubjects(keep?: string) {
  select.replaceChildren();
  const sections: Array<[string, string, string[]]> = [['Mine', 'Mine', store.mineNames()]];
  for (const [label, names] of exampleGroups) sections.push(['Sketches', `Sketches · ${label}`, names]);
  sections.push(['Forms', 'Forms', formNames]);
  for (const [label, names] of catalogueGroups) sections.push(['Parts', `Parts · ${label}`, names]);
  for (const [kind, label, names] of sections) {
    if (!names.length) continue;
    const group = document.createElement('optgroup');
    group.label = label;
    for (const n of names) {
      const opt = document.createElement('option');
      opt.value = `${kind}:${n}`;
      opt.textContent = n;
      group.append(opt);
    }
    select.append(group);
  }
  if (keep) select.value = keep;
}

/** What the editor should show for a subject: a saved sketch, a draft, or the example itself. */
function sourceFor(kind: string, name: string): string | undefined {
  if (kind === 'Mine') return store.mine()[name];
  if (kind === 'Sketches') return store.draft(name) ?? examples[name];
  return undefined;
}

const isSketchKind = (kind: string) => kind === 'Sketches' || kind === 'Mine';

fillSubjects();
{
  const remembered = store.subject();
  const initial = remembered && [...select.options].some((o) => o.value === remembered)
    ? remembered
    : `Sketches:${exampleNames[0]}`;
  select.value = initial;
  state.subject = initial.split(':')[1];
}

function chooseSubject(value: string) {
  select.value = value;
  const [kind, name] = value.split(':');
  state.subject = name;
  store.setSubject(value);
  const source = sourceFor(kind, name);
  if (source !== undefined) editor.set(source);
  framed = '';
  refreshActions();
  build();
}
select.addEventListener('change', () => chooseSubject(select.value));

/** Every edit lands on its shelf: a saved sketch is rewritten, an example gains or loses a draft. */
function persist() {
  const [kind, name] = select.value.split(':');
  const source = editor.get();
  if (kind === 'Mine') store.save(name, source);
  else if (kind === 'Sketches') store.setDraft(name, source === examples[name] ? undefined : source);
  refreshActions();
}

let recompile = 0;
const editor = createEditor(document.getElementById('source')!, sourceFor(...select.value.split(':') as [string, string]) ?? '', () => {
  clearTimeout(recompile);
  recompile = window.setTimeout(build, 120);
  persist();
}, (pos) => selectFromSource(pos));
buildPalette(document.getElementById('palette')!, editor.view);
subjectSet.append(select);

// --- the shelf: save as, reset, delete, export, import ---

const actions = document.createElement('div');
actions.className = 'actions';
subjectSet.append(actions);

function action(label: string, title: string, onClick: () => void) {
  const b = document.createElement('button');
  b.textContent = label;
  b.title = title;
  b.addEventListener('click', onClick);
  actions.append(b);
  return b;
}

/** A name for a copy: the form's name if the sketch compiles, else the subject's. */
function suggestedName(): string {
  const [, name] = select.value.split(':');
  const result = compile(editor.get(), { resolve: resolveSketch });
  return result.sketch?.formName ?? name;
}

const saveAs = action('save as…', 'keep a copy of this sketch under a name of your own', () => {
  const name = window.prompt('Save this sketch as', suggestedName())?.trim();
  if (!name) return;
  if (store.mineNames().includes(name) && !window.confirm(`Replace the sketch called "${name}"?`)) return;
  store.save(name, editor.get());
  fillSubjects(`Mine:${name}`);
  chooseSubject(`Mine:${name}`);
});
const reset = action('reset', 'throw away the changes to this example', () => {
  const [, name] = select.value.split(':');
  store.setDraft(name, undefined);
  editor.set(examples[name]);
  refreshActions();
  build();
});
const remove = action('delete', 'remove this sketch from the browser', () => {
  const [, name] = select.value.split(':');
  if (!window.confirm(`Delete the sketch "${name}"? This cannot be undone.`)) return;
  store.remove(name);
  fillSubjects();
  chooseSubject(`Sketches:${exampleNames[0]}`);
});
action('export', 'download this sketch as a text file', () => {
  const [, name] = select.value.split(':');
  const blob = new Blob([editor.get()], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.sketch`;
  a.click();
  URL.revokeObjectURL(a.href);
});
action('import…', 'open a sketch file from disk into Mine', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.sketch,.txt,text/plain';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    const source = await file.text();
    let name = file.name.replace(/\.(sketch|txt)$/i, '');
    if (store.mineNames().includes(name)) {
      const chosen = window.prompt(`There is already a sketch called "${name}" — save this one as`, `${name} 2`)?.trim();
      if (!chosen) return;
      name = chosen;
    }
    store.save(name, source);
    fillSubjects(`Mine:${name}`);
    chooseSubject(`Mine:${name}`);
  });
  input.click();
});

/** Only the actions that make sense for the subject on screen are shown. */
function refreshActions() {
  const [kind, name] = select.value.split(':');
  const sketch = isSketchKind(kind);
  actions.hidden = !sketch;
  saveAs.hidden = !sketch;
  reset.hidden = !(kind === 'Sketches' && store.draft(name) !== undefined);
  remove.hidden = kind !== 'Mine';
}
refreshActions();

/** `use` looks on the shelf first, so a saved sketch can be brought into another. */
const resolveSketch = (name: string) => store.mine()[name] ?? examples[name];

let metalSelect: HTMLSelectElement;
let finishSelect: HTMLSelectElement;

const materialSet = document.createElement('fieldset');
materialSet.innerHTML = '<legend>Material</legend>';
materialSet.append(
  picker('metal', metalNames, state.metal, (v) => {
    state.metal = v;
    viewer.setMaterial(state.metal, state.finish);
  }, (sel) => { metalSelect = sel; }),
  picker('finish', finishNames, state.finish, (v) => {
    state.finish = v;
    viewer.setMaterial(state.metal, state.finish);
  }, (sel) => { finishSelect = sel; }),
);

let environmentPicker: HTMLSelectElement | null = null;
const lightSet = document.createElement('fieldset');
lightSet.innerHTML = '<legend>Light</legend>';
lightSet.append(
  picker('environment', ['studio', 'daylight', 'dusk', 'gallery'], state.environment, (v) => {
    state.environment = v as EnvPreset | 'image';
    const env = viewer.setEnvironment(state.environment);
    hdrNote.textContent = env.highDynamicRange
      ? ''
      : 'float render targets unavailable — baked at 8 bits';
  }, (sel) => { environmentPicker = sel; }),
  (() => {
    // a photographed environment: a Radiance .hdr light probe from disk
    const row = document.createElement('div');
    row.className = 'row actions';
    const b = document.createElement('button');
    b.textContent = 'load HDRI…';
    b.title = 'light the piece with a Radiance .hdr light probe from disk';
    b.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.hdr,.pic';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const img = parseHdr(await file.arrayBuffer());
          viewer.setEnvironmentImage(img, meanRadiance(img));
          if (environmentPicker && ![...environmentPicker.options].some((o) => o.value === 'image')) {
            const opt = document.createElement('option');
            opt.value = 'image';
            opt.textContent = 'image';
            environmentPicker.append(opt);
          }
          if (environmentPicker) environmentPicker.value = 'image';
          state.environment = 'image';
          hdrNote.textContent = `${file.name} — ${img.width}×${img.height}`;
        } catch (err) {
          hdrNote.textContent = `could not read ${file.name}: ${(err as Error).message}`;
        }
      });
      input.click();
    });
    row.append(b);
    return row;
  })(),
  slider('exposure', 0.15, 4, 0.05, state.exposure, (v) => `${v.toFixed(2)}×`, (v) => {
    state.exposure = v;
    viewer.setExposure(v);
  }),
  slider('bloom', 0, 0.08, 0.002, state.bloom, (v) => v.toFixed(3), (v) => {
    state.bloom = v;
    viewer.setBloom(v);
  }),
  slider('glow', 0, 4, 0.05, state.glow, (v) => `${v.toFixed(2)}×`, (v) => {
    state.glow = v;
    viewer.setGlow(v);
  }),
  slider('rotate env', 0, 6.283, 0.02, state.envSpin, (v) => `${Math.round((v * 180) / Math.PI)}°`, (v) => {
    state.envSpin = v;
    viewer.setEnvSpin(v);
  }),
  slider('contact', 0, 1, 0.02, state.contact, (v) => v.toFixed(2), (v) => {
    state.contact = v;
    viewer.setContact(v);
  }),
  slider('ambient', 0, 2, 0.02, state.envStrength, (v) => `${v.toFixed(2)}×`, (v) => {
    state.envStrength = v;
    viewer.setEnvStrength(v);
  }),
  colour('background', state.background, (hex) => {
    state.background = hex;
    viewer.setBackground(hexToRgb(hex));
  }),
  picker('table', tableNames, state.table, (v) => {
    state.table = v as TableName;
    viewer.setTable(state.table);
  }),
);
const degrees = (v: number) => `${Math.round((v * 180) / Math.PI)}°`;
const applyKey = () => {
  viewer.setKeyLight({
    elevation: state.keyElevation, azimuth: state.keyAzimuth, strength: state.keyStrength, warmth: state.keyWarmth, size: state.keySize,
  });
  viewer.setRig(RIGS[state.rig](state.keyAzimuth, state.keyStrength));
};
const keySet = document.createElement('fieldset');
keySet.innerHTML = '<legend>Key light</legend>';
keySet.append(
  slider('strength', 0, 4, 0.05, state.keyStrength, (v) => `${v.toFixed(2)}×`, (v) => { state.keyStrength = v; applyKey(); }),
  slider('elevation', 0, 1.55, 0.02, state.keyElevation, degrees, (v) => { state.keyElevation = v; applyKey(); }),
  slider('azimuth', -3.142, 3.142, 0.02, state.keyAzimuth, degrees, (v) => { state.keyAzimuth = v; applyKey(); }),
  slider('warmth', -1, 1, 0.05, state.keyWarmth, (v) => v.toFixed(2), (v) => { state.keyWarmth = v; applyKey(); }),
  slider('size', 0, 0.6, 0.01, state.keySize, (v) => (v < 0.005 ? 'point' : degrees(v * 2)), (v) => { state.keySize = v; applyKey(); }),
  picker('rig', Object.keys(RIGS), state.rig, (v) => { state.rig = v as RigName; applyKey(); }),
);
const hdrNote = document.createElement('div');
hdrNote.className = 'note';
lightSet.append(hdrNote);

const DEBUG_MODES = ['shaded', 'normals', 'uv', 'roughness', 'prefiltered', 'brdf', 'occlusion', 'wear'];

/**
 * The camera. Where it stands is the orbit's, which a drag on the canvas
 * also moves, so those sliders follow the camera each frame; the lens, the
 * tilt of the horizon and the shift are the camera's own. Presets are
 * viewpoints round the piece: they set the angles and leave the distance.
 */
const VIEWS: Record<string, { elevation: number; azimuth: number }> = {
  'three-quarter': { elevation: 0.72, azimuth: 0.87 },
  front: { elevation: 0.17, azimuth: 0 },
  profile: { elevation: 0.17, azimuth: Math.PI / 2 },
  high: { elevation: 1.1, azimuth: 0.7 },
  top: { elevation: 1.5, azimuth: 0.78 },
  low: { elevation: 0.06, azimuth: 0.5 },
};
const cameraFollowers: Array<(v: ReturnType<Viewer['viewState']>) => void> = [];
const applyLens = () => viewer.setLens(state.lens);
const cameraSet = document.createElement('fieldset');
cameraSet.innerHTML = '<legend>Camera</legend>';
cameraSet.append(
  picker('view', Object.keys(VIEWS), 'three-quarter', (v) => viewer.setView(VIEWS[v])),
  slider('lens', 20, 200, 1, state.lens, (v) => `${Math.round(v)} mm`, (v) => { state.lens = v; applyLens(); }),
  slider('elevation', 0, 1.55, 0.01, 0.72, degrees, (v) => viewer.setView({ elevation: v }),
    (set) => cameraFollowers.push((v) => set(Math.round(v.elevation * 100) / 100))),
  slider('azimuth', -3.142, 3.142, 0.01, 0.87, degrees, (v) => viewer.setView({ azimuth: v }),
    (set) => cameraFollowers.push((v) => set(Math.round(Math.atan2(Math.sin(v.azimuth), Math.cos(v.azimuth)) * 100) / 100))),
  slider('distance', 10, 600, 1, 120, (v) => `${Math.round(v)} mm`, (v) => viewer.setView({ distance: v }),
    (set) => cameraFollowers.push((v) => set(Math.round(v.distance)))),
  slider('tilt', -0.8, 0.8, 0.01, state.tilt, degrees, (v) => { state.tilt = v; viewer.setCameraRoll(v); }),
  slider('shift across', -0.6, 0.6, 0.01, state.shiftX, (v) => `${Math.round(v * 100)}%`, (v) => { state.shiftX = v; viewer.setLensShift(state.shiftX, state.shiftY); }),
  slider('shift up', -0.6, 0.6, 0.01, state.shiftY, (v) => `${Math.round(v * 100)}%`, (v) => { state.shiftY = v; viewer.setLensShift(state.shiftX, state.shiftY); }),
  slider('depth of field', 0, 1, 0.02, state.dof, (v) => (v === 0 ? 'off' : v.toFixed(2)), (v) => {
    state.dof = v;
    viewer.setDepthOfField(state.dof, state.focus);
  }),
  slider('focus', 0.4, 2.5, 0.02, state.focus, (v) => `${v.toFixed(2)}× distance`, (v) => {
    state.focus = v;
    viewer.setDepthOfField(state.dof, state.focus);
  }),
);

const viewSet = document.createElement('fieldset');
viewSet.innerHTML = '<legend>View</legend>';
// traced quality converges while the view is still: say how far it has got
const traceNote = document.createElement('div');
traceNote.className = 'note';
traceNote.hidden = true;
const showTraceProgress = () => {
  if (state.quality !== 'traced') return;
  const n = viewer.traceSamples;
  traceNote.textContent = n >= viewer.traceLimit ? `${n} samples, converged` : n > 0 ? `${n} samples…` : 'tracing when the view is still';
};
viewSet.append(
  picker('quality', ['draft', 'final', 'traced'], state.quality, (v) => {
    state.quality = v as Quality;
    viewer.setQuality(state.quality);
    traceNote.hidden = state.quality !== 'traced';
  }),
  traceNote,
  picker('debug', DEBUG_MODES, 'shaded', (v) => {
    state.debug = DEBUG_MODES.indexOf(v);
    viewer.setDebug(state.debug);
  }),
  slider('render scale', 0.5, 1, 0.05, state.renderScale, (v) => `${Math.round(v * 100)}%`, (v) => {
    state.renderScale = v;
    viewer.setRenderScale(v);
  }),
  toggle('show anchors', 'showAnchors', () => build()),
);

applyKey();
viewer.setBackground(hexToRgb(state.background));
// the film: how the finished frame comes to the screen
const filmSet = document.createElement('fieldset');
filmSet.innerHTML = '<legend>Film</legend>';
filmSet.append(
  picker('tonemap', ['agx', 'aces'], state.tonemap, (v) => {
    state.tonemap = v as 'agx' | 'aces';
    viewer.setFilm({ tonemap: v === 'agx' ? 1 : 0 });
  }),
  slider('detail', 0, 1, 0.02, state.detail, (v) => v.toFixed(2), (v) => {
    state.detail = v;
    viewer.setDetail(v);
  }),
  slider('vignette', 0, 1, 0.02, state.vignette, (v) => v.toFixed(2), (v) => {
    state.vignette = v;
    viewer.setFilm({ vignette: v });
  }),
  slider('grain', 0, 1, 0.02, state.grain, (v) => v.toFixed(2), (v) => {
    state.grain = v;
    viewer.setFilm({ grain: v });
  }),
  slider('fringe', 0, 1, 0.02, state.fringe, (v) => v.toFixed(2), (v) => {
    state.fringe = v;
    viewer.setFilm({ fringe: v });
  }),
);

controlsEl.append(subjectSet, materialSet, lightSet, keySet, cameraSet, filmSet, viewSet);

/** Group placements by the mesh they share — that grouping is the draw call list. */
function groupByMesh(assembly: Assembly) {
  type Group = { mesh: Mesh; matrices: number[]; placements: Placement[]; metal?: string; finish?: string; enamel?: string; relief?: PlateRelief; veinMetal?: string; pavilionFacets?: number; engraving?: Engraving; inscription?: Inscription; glow?: number; gemPlanes?: Float32Array; gemSize?: number };
  // Two parts made by the same call share a mesh, so the mesh alone is not
  // the group: what is drawn on the surface has to match as well.
  const byMesh = new Map<Mesh, Group[]>();
  const sameSurface = (g: Group, part: Part) =>
    g.metal === part.material?.metal && g.finish === part.material?.finish && g.enamel === part.enamel
    && g.veinMetal === part.veinMetal && g.engraving === part.engraving && g.inscription === part.inscription && g.glow === part.glow;
  for (const p of assembly.placements) {
    let groups = byMesh.get(p.part.mesh);
    if (!groups) { groups = []; byMesh.set(p.part.mesh, groups); }
    let group = groups.find((g) => sameSurface(g, p.part));
    if (!group) {
      group = { mesh: p.part.mesh, matrices: [], placements: [], metal: p.part.material?.metal, finish: p.part.material?.finish, enamel: p.part.enamel, relief: p.part.relief, veinMetal: p.part.veinMetal, pavilionFacets: p.part.pavilionFacets, engraving: p.part.engraving, inscription: p.part.inscription, glow: p.part.glow, gemPlanes: p.part.gemPlanes, gemSize: p.part.gemSize };
      groups.push(group);
    }
    for (let i = 0; i < 16; i++) group.matrices.push(p.matrix[i]);
    group.placements.push(p);
  }
  return [...byMesh.values()].flat().map((g) => ({
    mesh: g.mesh,
    matrices: new Float32Array(g.matrices),
    placements: g.placements,
    metal: g.metal,
    finish: g.finish,
    enamel: g.enamel,
    relief: g.relief,
    veinMetal: g.veinMetal,
    pavilionFacets: g.pavilionFacets,
    engraving: g.engraving,
    inscription: g.inscription,
    glow: g.glow,
    gemPlanes: g.gemPlanes,
    gemSize: g.gemSize,
  }));
}

/** The divider above the editor: drag to give the source or the viewport more room. */
{
  const splitter = document.getElementById('splitter')!;
  const root = document.documentElement;
  const saved = store.editorHeight();
  if (saved) root.style.setProperty('--editor-h', `${saved}px`);
  splitter.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    splitter.classList.add('dragging');
    document.body.classList.add('resizing');
    const startY = e.clientY;
    const startH = editorPane.getBoundingClientRect().height;
    const move = (ev: PointerEvent) => {
      root.style.setProperty('--editor-h', `${Math.round(startH + (startY - ev.clientY))}px`);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      splitter.classList.remove('dragging');
      document.body.classList.remove('resizing');
      store.setEditorHeight(Math.round(editorPane.getBoundingClientRect().height));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });
  splitter.addEventListener('dblclick', () => {
    root.style.removeProperty('--editor-h');
    store.setEditorHeight(null);
  });
}

/** The groups on screen, placement by placement, so a pick or a cursor can be traced. */
let shown: Array<{ placements: Placement[] }> = [];
let partSpans = new Map<Part, Span>();

/**
 * Source to screen: light every placement the statement under the cursor
 * had a hand in. A `place` inside a unit lights its copies under every
 * repeat, the repeat lights everything it copied, a part declaration lights
 * every placement of that part. With the cursor elsewhere nothing is dimmed.
 */
/**
 * Which placements the statement at `pos` had a hand in.
 *
 * The innermost statement wins: a unit's span encloses the lines inside it,
 * so matching any enclosing origin would light the whole unit from a cursor
 * on one line of it. Only the smallest span round the cursor counts, and a
 * placement matches when that span is one of its origins or its part's.
 */
function matcherAt(pos: number): (p: Placement) => boolean {
  const within = (s: { start: number; end: number }) => pos >= s.start && pos <= s.end;
  let best: { start: number; end: number } | null = null;
  const consider = (s: { start: number; end: number }) => {
    if (within(s) && (!best || s.end - s.start < best.end - best.start)) best = s;
  };
  for (const g of shown) for (const p of g.placements) p.origins.forEach(consider);
  for (const s of partSpans.values()) consider(s);
  if (!best) return () => false;
  const b: { start: number; end: number } = best;
  const same = (s: { start: number; end: number }) => s.start === b.start && s.end === b.end;
  return (p) => {
    const span = partSpans.get(p.part);
    return (span !== undefined && same(span)) || p.origins.some(same);
  };
}

function selectFromSource(pos: number) {
  if (labelled.length) layoutLabels();
  if (!shown.length) return;
  const matches = matcherAt(pos);
  let any = false;
  const flags = shown.map((g) => {
    const f = new Float32Array(g.placements.length) as Float32Array<ArrayBuffer>;
    g.placements.forEach((p, i) => { if (matches(p)) { f[i] = 1; any = true; } });
    return f;
  });
  viewer.setSelection(any ? flags : null);
}

/** Screen to source: a click on an instance selects the statement that placed it. */
{
  let downAt: [number, number] | null = null;
  stage.addEventListener('pointerdown', (e) => {
    downAt = e.button === 0 && !e.shiftKey ? [e.clientX, e.clientY] : null;
  });
  stage.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    downAt = null;
    if (moved > 4 || !shown.length) return;
    const hit = viewer.pick(e.clientX, e.clientY);
    if (!hit) { viewer.setSelection(null); return; }
    const placement = shown[hit.group]?.placements[hit.instance];
    const origin = placement?.origins[0];
    if (origin) editor.jumpTo(origin.start, origin.end);
    else viewer.setSelection(null);
  });
}

/**
 * Anchor names, laid over the canvas as text. Fastening is written by anchor
 * name, and the lines the viewer draws say where an anchor is but not what
 * it is called. With a selection only its anchors are named; without one
 * every anchor is, or when there are too many to read, one placement's per part.
 */
interface Labelled { placement: Placement; anchor: Anchor }
let labelled: Labelled[] = [];
const labelLayer = document.createElement('div');
labelLayer.id = 'labels';
stage.append(labelLayer);
const labelPool: HTMLElement[] = [];
const LABEL_LIMIT = 48;

function layoutLabels() {
  const matches = matcherAt(editor.view.state.selection.main.head);
  const chosen = labelled.filter(({ placement }) => matches(placement));
  let show = chosen.length ? chosen : labelled;
  if (show.length > LABEL_LIMIT) {
    // too many to read: name each anchor once, on the first placement of its part
    const seen = new Set<Part>();
    show = show.filter(({ placement: p }) => {
      if (seen.has(p.part)) return false;
      seen.add(p.part);
      return true;
    });
    // the filter kept one placement per part; now let its anchors through
    const firsts = new Set(show.map((l) => l.placement));
    show = (chosen.length ? chosen : labelled).filter((l) => firsts.has(l.placement));
  }
  while (labelPool.length < show.length) {
    const el = document.createElement('div');
    el.className = 'label';
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const text = el.dataset.ref!;
      const v = editor.view;
      const at = v.state.selection.main.head;
      v.dispatch({ changes: { from: at, insert: text }, selection: { anchor: at + text.length } });
      v.focus();
    });
    labelLayer.append(el);
    labelPool.push(el);
  }
  labelPool.forEach((el, i) => {
    const item = show[i];
    if (!item) { el.hidden = true; return; }
    const { placement, anchor } = item;
    const p = viewer.project(anchor.position);
    if (!p) { el.hidden = true; return; }
    el.hidden = false;
    const ref = `${placement.part.name}.${anchor.name}`;
    if (el.dataset.ref !== ref) { el.textContent = ref; el.dataset.ref = ref; }
    el.style.transform = `translate(${p[0].toFixed(0)}px, ${p[1].toFixed(0)}px)`;
  });
}
viewer.onFrame = () => {
  if (labelled.length) layoutLabels();
  showTraceProgress();
  const view = viewer.viewState();
  for (const follow of cameraFollowers) follow(view);
};

function build() {
  const [kind] = select.value.split(':');
  editorPane.classList.toggle('open', isSketchKind(kind));

  const t0 = performance.now();
  let assembly: Assembly;
  partSpans = new Map();

  if (isSketchKind(kind)) {
    const result = compile(editor.get(), { resolve: resolveSketch });
    editor.report(result);
    if (result.error) {
      diagnosticText.textContent = `line ${result.error.line}: ${result.error.message}`;
      diagnosticEl.classList.add('bad');
      // keep the last good shape on screen rather than blanking on every keystroke
      return;
    }
    diagnosticText.textContent = `${result.sketch!.formName} — ${result.sketch!.assembly.stats().instances} placements`;
    diagnosticEl.classList.remove('bad');
    assembly = result.sketch!.assembly;
    partSpans = result.sketch!.partSpans;
    sketchNames.parts = new Map([...partSpans.keys()].map((p) => [p.name, p.anchors.map((a) => a.name)]));
    sketchNames.units = [...editor.get().matchAll(/^\s*unit\s+([a-zA-Z_]\w*)/gm)].map((m) => m[1]);
    // a sketch declares its own material, so follow it in the panel too
    if (result.sketch!.metal) state.metal = result.sketch!.metal;
    if (result.sketch!.finish) state.finish = result.sketch!.finish;
    metalSelect.value = state.metal;
    finishSelect.value = state.finish;
    viewer.setMaterial(state.metal, state.finish);
  } else if (kind === 'Forms') {
    assembly = forms[state.subject]();
  } else {
    assembly = new Assembly(state.subject);
    assembly.place(catalogue[state.subject](), identity());
  }
  const ms = performance.now() - t0;

  const groups = groupByMesh(assembly);
  viewer.setInstanced(groups);
  shown = isSketchKind(kind) ? groups : [];
  selectFromSource(editor.view.state.selection.main.head);

  const bounds = assembly.bounds();
  const span = Math.max(
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  );

  const anchors: Anchor[] = state.showAnchors
    ? assembly.placements.flatMap((p) => p.anchors)
    : [];
  viewer.setAnchors(anchors, span * 0.02);
  labelled = state.showAnchors && isSketchKind(kind)
    ? assembly.placements.flatMap((p) => p.anchors.map((a) => ({ placement: p, anchor: a })))
    : [];
  layoutLabels();

  if (framed !== select.value) {
    viewer.frameBounds(bounds);
    framed = select.value;
  }

  report(assembly, ms, span);
}

/**
 * Counting bodies is the slowest thing in the panel — seconds on a dense form —
 * so it runs in a worker, and a token drops the answer if the subject changed
 * while it was working.
 */
let connectivityToken = 0;
const connectivityWorker = new Worker(new URL('./assembly/connectivity.worker.ts', import.meta.url), { type: 'module' });
let onConnectivity: ((r: ConnectivityResponse) => void) | null = null;
// one request in flight; while it runs, only the latest edit waits behind it
let connectivityBusy = false;
let connectivityPending: ConnectivityRequest | null = null;
connectivityWorker.addEventListener('message', (e: MessageEvent<ConnectivityResponse>) => {
  connectivityBusy = false;
  if (connectivityPending) {
    const next = connectivityPending;
    connectivityPending = null;
    connectivityBusy = true;
    connectivityWorker.postMessage(next);
  }
  onConnectivity?.(e.data);
});

function requestConnectivity(assembly: Assembly, token: number) {
  const meshes: Mesh[] = [];
  const index = new Map<Mesh, number>();
  const placements = assembly.placements.map((p) => {
    let i = index.get(p.part.mesh);
    if (i === undefined) {
      i = meshes.length;
      index.set(p.part.mesh, i);
      meshes.push(p.part.mesh);
    }
    return { mesh: i, matrix: p.matrix };
  });
  const request: ConnectivityRequest = {
    token,
    meshes: meshes.map((m) => ({ positions: m.positions, indices: m.indices })),
    placements,
  };
  if (connectivityBusy) { connectivityPending = request; return; }
  connectivityBusy = true;
  connectivityWorker.postMessage(request);
}

function report(assembly: Assembly, ms: number, span: number) {
  const s = assembly.stats();
  const rows: Array<[string, string, string?]> = [
    ['instances', s.instances.toLocaleString()],
    ['distinct parts', String(s.uniqueParts)],
    ['draw calls', String(s.uniqueParts), 'hi'],
    ['unique triangles', s.uniqueTriangles.toLocaleString()],
    ['drawn triangles', s.drawnTriangles.toLocaleString()],
    ['mirrored', String(s.mirrored)],
    ['extent', `${span.toFixed(0)} mm`],
    ['generate', `${ms.toFixed(1)} ms`],
    // Whether the model is one solid, which is what an STL has to be. Nothing on
    // screen distinguishes a petal welded to the receptacle from one a hair clear
    // of it, so without this the only way to find out is to try to print it.
    ['bodies', '…'],
  ];
  const draw = () => {
    statsEl.innerHTML = rows
      .map(([k, v, cls]) => `<tr><td>${k}</td><td class="${cls ?? ''}">${v}</td></tr>`)
      .join('');
  };
  draw();

  const token = ++connectivityToken;
  onConnectivity = ({ token: answered, bodies, floating }) => {
    if (answered !== connectivityToken) return;
    rows[rows.length - 1] = [
      'bodies',
      bodies === 1 ? '1' : `${bodies}${floating ? ` (${floating} loose)` : ''}`,
      bodies === 1 ? 'hi' : 'warn',
    ];
    draw();
  };
  requestConnectivity(assembly, token);

  const ratio = s.drawnTriangles / Math.max(s.uniqueTriangles, 1);
  budgetEl.innerHTML =
    `<b class="pass">${ratio.toFixed(1)}× reuse</b>` +
    `${s.instances} placements built from ${s.uniqueTriangles.toLocaleString()} triangles of real geometry`;
}

viewer.setMaterial(state.metal, state.finish);
build();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).artshape = { state, build, select, viewer, editor, formNames, catalogueNames };
