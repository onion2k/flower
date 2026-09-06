# artshape

Read INTENT.md before planning any change larger than a fix: it says why
the project exists, what it is for, the constraints every change must
keep, and the open questions. If a change would move the direction, say
so and propose an edit to INTENT.md rather than drifting.

ROADMAP.md is the record of what was built, what was measured, what was
tried and taken out, and what is open. Add to it as work lands, with
numbers. TESTING.md says how the suites are run and what they cover.

Before committing a rendering change, hold it to the tracer or to a
known answer (the furnace, the raster-versus-traced comparisons in the
GPU suite); `npm test` and `npm run test:gpu` must pass.
