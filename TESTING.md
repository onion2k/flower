# Testing

`npm test` runs the suite once; `npm run test:watch` keeps it open. Vitest,
configured in `vitest.config.ts` to pick up `src/**/*.test.ts`. Tests live
next to what they cover, in a `__tests__` directory alongside the module.

## What's covered

Roughly bottom-up, from the math to the DOM:

- **DSL** (`src/dsl/__tests__`) — lexer, parser, evaluator, and the builtin
  registry, including the `Args` reader and `signature()`, the probe the
  editor's help strip and completions run on.
- **Geometry and pattern math** (`src/geom/__tests__`, `src/pattern/__tests__`)
  — vectors, transforms, curves, symmetries. Pure functions, checked against
  known results (a 90° rotation, a circle's arc length) rather than against
  each other.
- **Builtin dispatch** (`src/dsl/__tests__/builtins-dispatch.test.ts`) — that
  a DSL call reads the right argument into the right parameter of the
  underlying geometry or pattern function. A `repeat` around a single-part
  unit at the identity makes a placement's matrix exactly the symmetry's own
  transform, which is what lets these checks be exact rather than
  approximate.
- **Mesh generators** (`src/mesh/__tests__`) — profile, sweep, revolve,
  extrude, and the shared mesh helpers (`MeshBuilder`, `mergeMeshes`, the
  enamel markers). Two shared assertions in `helpers.ts`:
  `expectWellFormed` (index bounds, unit normals, no degenerate triangles)
  and `expectWatertight` (every edge shared by exactly two faces — see the
  gotcha below on why that has to be keyed by position, not index).
- **Part builders** (`src/parts/__tests__`) — one file per part module,
  checking anchors, bounds, well-formedness across the real option space,
  and enamel wiring.
- **Outline, deform, and wear** (`src/geom/__tests__/outline*.test.ts`,
  `src/mesh/__tests__/deform*.test.ts`, `wear*.test.ts`) — leaf and petal
  silhouettes, the cup/curl/twist/ruffle/relief deformation fields, and the
  curvature-based wear heuristic. Includes an `-edges` file per module for
  zero, negative, and degenerate inputs specifically.
- **Camera and editor** (`src/gpu/__tests__`, `src/editor/__tests__`) —
  `Camera`'s matrices (pure) and `Orbit`'s pointer/wheel handling (under
  jsdom, driven through real `addEventListener` wiring rather than by
  calling handlers directly); the editor's number-scrubbing and
  parameter-help logic, both pure over a bare CodeMirror `EditorState`;
  the localStorage-backed sketch store; and `createEditor` itself under
  jsdom.

## What's not covered, and why

`src/render/viewer.ts` and the WGSL shaders — the scene pass, materials,
occlusion baking, picking, selection — have no automated coverage. Node has
no WebGPU implementation, so there's nothing to run them against in a test
process. Verifying that layer means opening the app and looking at it: the
in-app browser preview, or a manual pass in a real browser. Treat a change
there as unverified until it's actually been seen on screen.

## Gotchas for writing tests here

- **`expectWatertight` keys edges by rounded position, not vertex index.**
  The mesh generators duplicate vertices on purpose at every crease and cap
  seam, so each side can carry its own normal — that's the generator working
  correctly, not a bug. Round to a fixed precision *before* folding `-0` to
  `+0`: a residual floating-point epsilon near a seam (an angle of 2π is not
  bit-identical to 0) rounds to `-0`, and `toFixed` prints that with a minus
  sign, hashing two geometrically identical vertices apart.
- **`deform()` mutates positions in place.** A test that searches for a
  vertex by its post-deform coordinates is searching a mesh the assertion
  has already changed — `cup()`, for instance, shortens a vertex's `y` as it
  lifts `z`, since it preserves arc length rather than projected width.
  Address vertices by their known grid index in a synthetic mesh, not by
  re-scanning coordinates after the call.
- **Hand-built "obviously curved" fixtures are unreliable for curvature
  heuristics** like `computeWear`. A synthetic two-face fold can give
  opposite signs to its own two seam-duplicate vertices if the fixture's
  geometry doesn't actually agree with itself on which side is the ridge.
  Prefer a real generator (e.g. `extrude()` with a bevel) as the fixture.
- **CodeMirror under jsdom needs a `Range` polyfill**, or it throws
  asynchronously from a `requestAnimationFrame` callback and fails the run
  with a non-zero exit even though every test passes. jsdom has no layout
  engine, so `Range.getClientRects` and `getBoundingClientRect` don't exist.
  Stub both at the top of the test file — see `editor/__tests__/index.test.ts`
  for the shim.
- **`Camera.lookAt` degenerates when the camera-to-target direction is
  parallel to +Z**, the "up" this whole project is authored around. The
  cross product that builds the view basis is then the zero vector, and the
  `|| 1` guard against dividing by zero silently zeroes the x/y basis rather
  than producing `NaN`. Don't place a camera (real or in a test) directly
  above or below its target on the Z axis; it's also why `Orbit` clamps its
  polar angle away from the poles.
