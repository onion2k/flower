# Testing

[![Check](https://github.com/onion2k/flower/actions/workflows/check.yml/badge.svg)](https://github.com/onion2k/flower/actions/workflows/check.yml)

`npm test` runs the suite once; `npm run test:watch` keeps it open. Vitest,
configured in `vitest.config.ts` to pick up `src/**/*.test.ts`. Tests live
next to what they cover, in a `__tests__` directory alongside the module.

Most of what this project used to test now lives in
[artshape-render](https://github.com/onion2k/artshape-render) — the
geometry, the mesh generators, the parts, the assembly, the renderer and
the language, with their own 880 node tests and 28 headless-Chrome ones,
including everything that needs a real WebGPU device. Run those in the
library's own checkout; before a rendering change is committed here, they
are what must pass.

Every push and pull request runs `npm ci`, `npm test` and `npm run build`
on GitHub (`.github/workflows/check.yml`). The `npm ci` matters as much as
the tests: the renderer is a dependency pinned to a tag, so the run says
both that the tag still builds what depends on it and that the lockfile
and `package.json` agree — the second of which went wrong, silently, the
day the renderer moved out.

## What's covered here

- **The editor** (`src/editor/__tests__`) — number-scrubbing and
  parameter-help logic, both pure over a bare CodeMirror `EditorState`;
  the localStorage-backed sketch store; and `createEditor` itself under
  jsdom.
- **The examples** (`src/__tests__`) — that every sketch in the picker
  compiles, builds more than one placement, and is listed in a group; a
  sketch that fails here fails in the picker, where the user sees an error
  instead of the piece it promises. And the chess set checked as a chess
  set: a board whose colours a player would recognise, and thirty-two men
  on the squares they start a game on.

## What's not covered, and why

The page itself — `main.ts`, its panels and its layout — has no automated
coverage: it is a driver over the viewer and the language, and a change to
it is judged by opening it. `src/spike/validate.ts` and `bodies.ts` are
scripts for looking at the assembly by hand rather than tests.

## Gotchas for writing tests here

- **CodeMirror under jsdom needs a `Range` polyfill**, or it throws
  `getClientRects is not a function` on the first render.
  `src/editor/__tests__/index.test.ts` installs one; copy it rather than
  rediscovering it.
- **The language's `compile()` has no catalogue to fall back on.** A
  sketch that `use`s another needs `{ resolve }` passed to it — for these
  tests, the page's own examples.
