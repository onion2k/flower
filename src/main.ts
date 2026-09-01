import { dualContour, type MeshData } from './mesh/dualContour';
import { plate, defaultPlate, type PlateSpec } from './spike/plate';
import { Viewer } from './render/viewer';

const stage = document.getElementById('stage')!;
const controlsEl = document.getElementById('controls')!;
const statsEl = document.getElementById('stats')!;
const budgetEl = document.getElementById('budget')!;

const viewer = new Viewer(stage);

const state = {
  resolution: 96,
  refineSteps: 3,
  creaseAngle: 40,
  ao: true,
  showNormals: false,
  fillet: defaultPlate.fillet,
  thickness: defaultPlate.thickness,
};

/** The number the spike exists to answer: can we mesh a real part inside a frame budget? */
const BUDGET_MS = 100;

function slider(
  label: string, key: keyof typeof state, min: number, max: number, step: number, fmt = (v: number) => String(v),
) {
  const wrap = document.createElement('label');
  const row = document.createElement('div');
  row.className = 'row';
  const name = document.createElement('span');
  name.textContent = label;
  const val = document.createElement('b');
  val.textContent = fmt(state[key] as number);
  row.append(name, val);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min); input.max = String(max); input.step = String(step);
  input.value = String(state[key]);
  input.addEventListener('input', () => {
    (state as any)[key] = parseFloat(input.value);
    val.textContent = fmt(state[key] as number);
    schedule();
  });
  wrap.append(row, input);
  return wrap;
}

function toggle(label: string, key: keyof typeof state, onChange?: () => void) {
  const wrap = document.createElement('label');
  wrap.className = 'check';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = state[key] as boolean;
  input.addEventListener('change', () => {
    (state as any)[key] = input.checked;
    if (onChange) onChange(); else schedule();
  });
  wrap.append(input, document.createTextNode(label));
  return wrap;
}

const geomSet = document.createElement('fieldset');
geomSet.innerHTML = '<legend>Mesher</legend>';
geomSet.append(
  slider('resolution', 'resolution', 32, 192, 8, (v) => `${v}³`),
  slider('bisection steps', 'refineSteps', 0, 6, 1),
  slider('crease angle', 'creaseAngle', 5, 90, 5, (v) => `${v}°`),
  toggle('bake occlusion', 'ao'),
);

const partSet = document.createElement('fieldset');
partSet.innerHTML = '<legend>Part</legend>';
partSet.append(
  slider('edge break', 'fillet', 0, 0.8, 0.05, (v) => `${v.toFixed(2)} mm`),
  slider('thickness', 'thickness', 0.6, 5, 0.2, (v) => `${v.toFixed(1)} mm`),
);

const viewSet = document.createElement('fieldset');
viewSet.innerHTML = '<legend>View</legend>';
viewSet.append(toggle('show normals', 'showNormals', () => viewer.setShowNormals(state.showNormals)));

controlsEl.append(geomSet, partSet, viewSet);

let timer = 0;
function schedule() {
  clearTimeout(timer);
  timer = window.setTimeout(build, 60);
}

function build() {
  const spec: PlateSpec = { ...defaultPlate, fillet: state.fillet, thickness: state.thickness };
  const { sdf, bounds } = plate(spec);

  const data = dualContour(sdf, {
    bounds,
    resolution: state.resolution,
    refineSteps: state.refineSteps,
    creaseAngle: state.creaseAngle,
    ao: state.ao,
  });

  viewer.setMesh(data);
  viewer.setAOStrength(state.ao ? 1 : 0);
  report(data);
}

function report(data: MeshData) {
  const s = data.stats;
  const rows: Array<[string, string, boolean?]> = [
    ['grid', `${s.dims[0]}×${s.dims[1]}×${s.dims[2]}`],
    ['cell size', `${s.cellSize.toFixed(3)} mm`],
    ['field evals', s.fieldEvals.toLocaleString()],
    ['vertices', s.vertexCount.toLocaleString()],
    ['triangles', s.triangleCount.toLocaleString()],
    ['— sample grid', `${s.gridMs.toFixed(1)} ms`],
    ['— hermite', `${s.hermiteMs.toFixed(1)} ms`],
    ['— qef solve', `${s.qefMs.toFixed(1)} ms`],
    ['— quads', `${s.quadMs.toFixed(1)} ms`],
    ['— crease split', `${s.normalMs.toFixed(1)} ms`],
    ['— occlusion', `${s.aoMs.toFixed(1)} ms`],
    ['total', `${s.totalMs.toFixed(1)} ms`, true],
  ];
  statsEl.innerHTML = rows
    .map(([k, v, hi]) => `<tr class="${hi ? 'hi' : ''}"><td>${k}</td><td class="${hi ? 'hi' : ''}">${v}</td></tr>`)
    .join('');

  const pass = s.totalMs <= BUDGET_MS;
  budgetEl.innerHTML =
    `<b class="${pass ? 'pass' : 'fail'}">${s.totalMs.toFixed(0)} ms / ${BUDGET_MS} ms</b>` +
    (pass ? 'within budget for a live re-mesh' : 'over budget — needs sparse evaluation or a worker');
}

build();
viewer.setShowNormals(state.showNormals);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).artshape = { state, build };
