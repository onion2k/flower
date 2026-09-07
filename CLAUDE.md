# artshape

The renderer, the parts, the assembly and the language live in
[artshape-render](https://github.com/onion2k/artshape-render), a separate
repository consumed as a dependency; `npm link artshape-render` against a
local checkout to work on both at once. What is here is the application:
the sketch editor, the catalogue of examples, the spike scripts and the
page that drives the viewer.

Read INTENT.md before planning any change larger than a fix: it says why
the project exists, what it is for, the constraints every change must
keep, and the open questions. If a change would move the direction, say
so and propose an edit to INTENT.md rather than drifting.

ROADMAP.md is the record of what was built, what was measured, what was
tried and taken out, and what is open. Add to it as work lands, with
numbers. TESTING.md says how the suites are run and what they cover.

A change to the renderer belongs in the library, and is held to the same
bar there: to the tracer, or to a known answer (the furnace, the
raster-versus-traced comparisons in the GPU suite). Its `npm test` and
`npm run test:gpu` must pass before it is committed, and this project's
`npm test` after it is picked up.
