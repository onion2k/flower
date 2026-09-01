import { catalogue, catalogueNames } from './spike/catalogue';
import { metalNames, finishNames } from './render/materials';
import type { EnvPreset } from './render/env';
import { forms, formNames } from './spike/forms';
import { Assembly } from './assembly/assembly';
import { identity } from './geom/transform';
import type { Anchor } from './parts/types';
import type { Mesh } from './mesh/types';
import { Viewer } from './render/viewer';

const stage = document.getElementById('stage')!;
const controlsEl = document.getElementById('controls')!;
const statsEl = document.getElementById('stats')!;
const budgetEl = document.getElementById('budget')!;

const viewer = new Viewer(stage);

const state = {
  subject: formNames[0],
  metal: 'gold',
  finish: 'polished',
  environment: 'studio' as EnvPreset,
  exposure: 1,
  envSpin: 0,
  backdrop: 0.42,
  debug: 0,
  showAnchors: false,
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

function picker(label: string, names: readonly string[], value: string, onPick: (v: string) => void) {
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
for (const [label, names] of [['Forms', formNames], ['Parts', catalogueNames]] as const) {
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
select.value = `Forms:${state.subject}`;
select.addEventListener('change', () => {
  state.subject = select.value.split(':')[1];
  build();
});
subjectSet.append(select);

const materialSet = document.createElement('fieldset');
materialSet.innerHTML = '<legend>Material</legend>';
materialSet.append(
  picker('metal', metalNames, state.metal, (v) => {
    state.metal = v;
    viewer.setMaterial(state.metal, state.finish);
  }),
  picker('finish', finishNames, state.finish, (v) => {
    state.finish = v;
    viewer.setMaterial(state.metal, state.finish);
  }),
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
  slider('rotate env', 0, 6.283, 0.02, state.envSpin, (v) => `${Math.round((v * 180) / Math.PI)}°`, (v) => {
    state.envSpin = v;
    viewer.setEnvSpin(v);
  }),
  slider('backdrop', 0, 1.5, 0.02, state.backdrop, (v) => v.toFixed(2), (v) => {
    state.backdrop = v;
    viewer.setBackdrop(v);
  }),
);
const hdrNote = document.createElement('div');
hdrNote.className = 'note';
lightSet.append(hdrNote);

const viewSet = document.createElement('fieldset');
viewSet.innerHTML = '<legend>View</legend>';
viewSet.append(
  picker('debug', ['shaded', 'normals', 'uv', 'roughness', 'prefiltered', 'brdf'], 'shaded', (v) => {
    state.debug = ['shaded', 'normals', 'uv', 'roughness', 'prefiltered', 'brdf'].indexOf(v);
    viewer.setDebug(state.debug);
  }),
  toggle('show anchors', 'showAnchors', () => build()),
);

controlsEl.append(subjectSet, materialSet, lightSet, viewSet);

/** Group placements by the mesh they share — that grouping is the draw call list. */
function groupByMesh(assembly: Assembly) {
  const byMesh = new Map<Mesh, { matrices: number[]; metal?: string; finish?: string }>();
  for (const p of assembly.placements) {
    let group = byMesh.get(p.part.mesh);
    if (!group) {
      group = { matrices: [], metal: p.part.material?.metal, finish: p.part.material?.finish };
      byMesh.set(p.part.mesh, group);
    }
    for (let i = 0; i < 16; i++) group.matrices.push(p.matrix[i]);
  }
  return [...byMesh].map(([mesh, g]) => ({
    mesh,
    matrices: new Float32Array(g.matrices),
    metal: g.metal,
    finish: g.finish,
  }));
}

function build() {
  const isForm = select.value.startsWith('Forms:');
  const t0 = performance.now();

  let assembly: Assembly;
  if (isForm) {
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

function report(assembly: Assembly, ms: number, span: number) {
  const s = assembly.stats();
  const rows: Array<[string, string, boolean?]> = [
    ['instances', s.instances.toLocaleString()],
    ['distinct parts', String(s.uniqueParts)],
    ['draw calls', String(s.uniqueParts), true],
    ['unique triangles', s.uniqueTriangles.toLocaleString()],
    ['drawn triangles', s.drawnTriangles.toLocaleString()],
    ['mirrored', String(s.mirrored)],
    ['extent', `${span.toFixed(0)} mm`],
    ['generate', `${ms.toFixed(1)} ms`],
  ];
  statsEl.innerHTML = rows
    .map(([k, v, hi]) => `<tr><td>${k}</td><td class="${hi ? 'hi' : ''}">${v}</td></tr>`)
    .join('');

  const ratio = s.drawnTriangles / Math.max(s.uniqueTriangles, 1);
  budgetEl.innerHTML =
    `<b class="pass">${ratio.toFixed(1)}× reuse</b>` +
    `${s.instances} placements built from ${s.uniqueTriangles.toLocaleString()} triangles of real geometry`;
}

viewer.setMaterial(state.metal, state.finish);
build();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).artshape = { state, build, select, viewer, formNames, catalogueNames };
