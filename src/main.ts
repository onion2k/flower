import type { ConnectivityRequest, ConnectivityResponse } from './assembly/connectivity.worker';
import { catalogue, catalogueNames } from './spike/catalogue';
import { examples, exampleNames } from './dsl/examples';
import { compile } from './dsl/index';
import { metalNames, finishNames } from './render/materials';
import type { EnvPreset } from './render/env';
import { forms, formNames } from './spike/forms';
import { Assembly } from './assembly/assembly';
import { identity } from './geom/transform';
import type { Anchor } from './parts/types';
import type { Mesh } from './mesh/types';
import { Viewer, type Quality } from './render/viewer';

const stage = document.getElementById('stage')!;
const controlsEl = document.getElementById('controls')!;
const statsEl = document.getElementById('stats')!;
const budgetEl = document.getElementById('budget')!;

const editor = document.getElementById('editor')!;
const sourceEl = document.getElementById('source') as HTMLTextAreaElement;
const diagnosticEl = document.getElementById('diagnostic')!;

let viewer: Viewer;
try {
  viewer = await Viewer.create(stage, (info) => {
    diagnosticEl.textContent = `GPU device lost (${info.reason}): ${info.message || 'the GPU timed out'} — reload the page`;
    diagnosticEl.classList.add('bad');
  });
} catch (err) {
  diagnosticEl.textContent = `renderer unavailable: ${(err as Error).message}`;
  diagnosticEl.classList.add('bad');
  throw err;
}

const state = {
  subject: formNames[0],
  metal: 'gold',
  finish: 'polished',
  environment: 'studio' as EnvPreset,
  exposure: 1,
  bloom: 0.018,
  envSpin: 0,
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

function slider(
  label: string, min: number, max: number, step: number, value: number,
  fmt: (v: number) => string, onInput: (v: number) => void,
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
  wrap.append(row, input);
  return wrap;
}

const subjectSet = document.createElement('fieldset');
subjectSet.innerHTML = '<legend>Subject</legend>';
const select = document.createElement('select');
for (const [label, names] of [
  ['Sketches', exampleNames], ['Forms', formNames], ['Parts', catalogueNames],
] as const) {
  const group = document.createElement('optgroup');
  group.label = label;
  for (const n of names) {
    const opt = document.createElement('option');
    opt.value = `${label}:${n}`;
    opt.textContent = n;
    group.append(opt);
  }
  select.append(group);
}
state.subject = exampleNames[0];
select.value = `Sketches:${state.subject}`;
select.addEventListener('change', () => {
  const [kind, name] = select.value.split(':');
  state.subject = name;
  if (kind === 'Sketches') sourceEl.value = examples[name];
  framed = '';
  build();
});

let recompile = 0;
sourceEl.addEventListener('input', () => {
  clearTimeout(recompile);
  recompile = window.setTimeout(build, 180);
});
subjectSet.append(select);

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

const lightSet = document.createElement('fieldset');
lightSet.innerHTML = '<legend>Light</legend>';
lightSet.append(
  picker('environment', ['studio', 'dusk', 'gallery'], state.environment, (v) => {
    state.environment = v as EnvPreset;
    const env = viewer.setEnvironment(state.environment);
    hdrNote.textContent = env.highDynamicRange
      ? ''
      : 'float render targets unavailable — baked at 8 bits';
  }),
  slider('exposure', 0.15, 4, 0.05, state.exposure, (v) => `${v.toFixed(2)}×`, (v) => {
    state.exposure = v;
    viewer.setExposure(v);
  }),
  slider('bloom', 0, 0.08, 0.002, state.bloom, (v) => v.toFixed(3), (v) => {
    state.bloom = v;
    viewer.setBloom(v);
  }),
  slider('rotate env', 0, 6.283, 0.02, state.envSpin, (v) => `${Math.round((v * 180) / Math.PI)}°`, (v) => {
    state.envSpin = v;
    viewer.setEnvSpin(v);
  }),
);
const hdrNote = document.createElement('div');
hdrNote.className = 'note';
lightSet.append(hdrNote);

const DEBUG_MODES = ['shaded', 'normals', 'uv', 'roughness', 'prefiltered', 'brdf', 'occlusion', 'wear'];

const viewSet = document.createElement('fieldset');
viewSet.innerHTML = '<legend>View</legend>';
viewSet.append(
  picker('quality', ['draft', 'final'], state.quality, (v) => {
    state.quality = v as Quality;
    viewer.setQuality(state.quality);
  }),
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

controlsEl.append(subjectSet, materialSet, lightSet, viewSet);

/** Group placements by the mesh they share — that grouping is the draw call list. */
function groupByMesh(assembly: Assembly) {
  const byMesh = new Map<Mesh, { matrices: number[]; metal?: string; finish?: string; enamel?: string }>();
  for (const p of assembly.placements) {
    let group = byMesh.get(p.part.mesh);
    if (!group) {
      group = { matrices: [], metal: p.part.material?.metal, finish: p.part.material?.finish, enamel: p.part.enamel };
      byMesh.set(p.part.mesh, group);
    }
    for (let i = 0; i < 16; i++) group.matrices.push(p.matrix[i]);
  }
  return [...byMesh].map(([mesh, g]) => ({
    mesh,
    matrices: new Float32Array(g.matrices),
    metal: g.metal,
    finish: g.finish,
    enamel: g.enamel,
  }));
}

function build() {
  const [kind] = select.value.split(':');
  editor.classList.toggle('open', kind === 'Sketches');

  const t0 = performance.now();
  let assembly: Assembly;

  if (kind === 'Sketches') {
    const result = compile(sourceEl.value);
    if (result.error) {
      diagnosticEl.textContent = result.error.formatted;
      diagnosticEl.classList.add('bad');
      // keep the last good shape on screen rather than blanking on every keystroke
      return;
    }
    diagnosticEl.textContent = `${result.sketch!.formName} — ${result.sketch!.assembly.stats().instances} placements`;
    diagnosticEl.classList.remove('bad');
    assembly = result.sketch!.assembly;
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

  viewer.setInstanced(groupByMesh(assembly));

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

sourceEl.value = examples[exampleNames[0]];
viewer.setMaterial(state.metal, state.finish);
build();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).artshape = { state, build, select, viewer, formNames, catalogueNames };
