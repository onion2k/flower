import { catalogue, catalogueNames } from './spike/catalogue';
import type { Part } from './parts/types';
import { Viewer } from './render/viewer';

const stage = document.getElementById('stage')!;
const controlsEl = document.getElementById('controls')!;
const statsEl = document.getElementById('stats')!;
const budgetEl = document.getElementById('budget')!;

const viewer = new Viewer(stage);

const state = {
  part: catalogueNames[0],
  showNormals: false,
  showUv: false,
  showAnchors: true,
};

/**
 * What a part should cost. Sculptures repeat a handful of parts dozens of times,
 * so the number that matters is per-part triangles, not per-frame.
 */
const BUDGET_TRIS = 6000;

let framedPart = '';

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

const partSelect = document.createElement('fieldset');
partSelect.innerHTML = '<legend>Part</legend>';
const select = document.createElement('select');
for (const n of catalogueNames) {
  const opt = document.createElement('option');
  opt.value = n;
  opt.textContent = n;
  select.append(opt);
}
select.value = state.part;
select.addEventListener('change', () => {
  state.part = select.value;
  build();
});
partSelect.append(select);

const viewSet = document.createElement('fieldset');
viewSet.innerHTML = '<legend>View</legend>';
viewSet.append(
  toggle('show normals', 'showNormals', () => viewer.setShowNormals(state.showNormals)),
  toggle('show uv', 'showUv', () => viewer.setShowUv(state.showUv)),
  toggle('show anchors', 'showAnchors', () => build()),
);

controlsEl.append(partSelect, viewSet);

function build() {
  const t0 = performance.now();
  const part: Part = catalogue[state.part]();
  const ms = performance.now() - t0;

  select.value = state.part;
  viewer.setMesh(part.mesh);

  const span = Math.max(
    part.bounds.max[0] - part.bounds.min[0],
    part.bounds.max[1] - part.bounds.min[1],
    part.bounds.max[2] - part.bounds.min[2],
  );
  viewer.setAnchors(state.showAnchors ? part.anchors : [], span * 0.09);

  if (framedPart !== state.part) {
    viewer.frameBounds(part.bounds);
    framedPart = state.part;
  }

  report(part, ms);
}

function report(part: Part, ms: number) {
  const tris = part.mesh.indices.length / 3;
  const verts = part.mesh.positions.length / 3;
  const b = part.bounds;
  const rows: Array<[string, string, boolean?]> = [
    ['anchors', String(part.anchors.length)],
    ['vertices', verts.toLocaleString()],
    ['triangles', tris.toLocaleString(), true],
    [
      'extent',
      `${(b.max[0] - b.min[0]).toFixed(1)} × ${(b.max[1] - b.min[1]).toFixed(1)} × ${(b.max[2] - b.min[2]).toFixed(1)} mm`,
    ],
    ['generate', `${ms.toFixed(2)} ms`],
  ];
  statsEl.innerHTML = rows
    .map(([k, v, hi]) => `<tr><td>${k}</td><td class="${hi ? 'hi' : ''}">${v}</td></tr>`)
    .join('');

  const pass = tris <= BUDGET_TRIS;
  budgetEl.innerHTML =
    `<b class="${pass ? 'pass' : 'fail'}">${tris.toLocaleString()} / ${BUDGET_TRIS.toLocaleString()} tris</b>` +
    (pass ? 'cheap enough to repeat across a form' : 'too heavy to instance freely');
}

build();
viewer.setShowNormals(state.showNormals);
viewer.setShowUv(state.showUv);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).artshape = { state, build, catalogueNames };
