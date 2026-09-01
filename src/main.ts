import { catalogue, catalogueNames } from './spike/catalogue';
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
  showNormals: false,
  showUv: false,
  showAnchors: false,
};

let framed = '';

function toggle(label: string, key: 'showNormals' | 'showUv' | 'showAnchors', onChange: () => void) {
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

const viewSet = document.createElement('fieldset');
viewSet.innerHTML = '<legend>View</legend>';
viewSet.append(
  toggle('show normals', 'showNormals', () => viewer.setShowNormals(state.showNormals)),
  toggle('show uv', 'showUv', () => viewer.setShowUv(state.showUv)),
  toggle('show anchors', 'showAnchors', () => build()),
);

controlsEl.append(subjectSet, viewSet);

/** Group placements by the mesh they share — that grouping is the draw call list. */
function groupByMesh(assembly: Assembly) {
  const byMesh = new Map<Mesh, number[]>();
  for (const p of assembly.placements) {
    let list = byMesh.get(p.part.mesh);
    if (!list) { list = []; byMesh.set(p.part.mesh, list); }
    for (let i = 0; i < 16; i++) list.push(p.matrix[i]);
  }
  return [...byMesh].map(([mesh, m]) => ({ mesh, matrices: new Float32Array(m) }));
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

build();
viewer.setShowNormals(state.showNormals);
viewer.setShowUv(state.showUv);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).artshape = { state, build, select, viewer, formNames, catalogueNames };
