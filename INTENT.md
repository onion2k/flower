# Intent: artshape

Draft, September 2026, written from the roadmap and the month's work for
the owner to correct. This file says why the project exists and what it
is for; the roadmap says what was built and what is open; TESTING.md says
how it is checked. Read this first when planning anything larger than a
fix, and change it only when the direction changes.

## Problem

Jewellery, and small made things generally, are designed by people who
think in parts, joins and finishes — a leaf pierced three times, studded,
with a curl between each — and rendered by tools that think in triangles.
Modelling a piece well enough to judge how it will look takes hours in a
general 3D package and a rendering setup on top, and the result is still
a picture of a computer model rather than of a thing on a bench. The gap
is worst for the ornamental styles — art nouveau, deco — whose parts are
few in kind and many in placement, and for the honest question a
jeweller asks first: what will this look like, in this metal, with this
finish, on a table, in this light.

## Proposed outcome

A sketch of a few lines describes a piece in its own vocabulary and is
drawn, at once, as a photograph would show it. Concretely:

- A small language of parts (plates, wires, revolves, sheets), joins
  (fasten to an anchor, solder fillets) and symmetries places real
  geometry from a sentence, and every number in it can be scrubbed live.
- One material record covers metals, nacre, gems, enamel, wood, plastic
  and light, drawn procedurally so a groove is the same width on a plate,
  a wire and a bead, and lettering and pattern are cut in millimetres.
- Two renderers share that record: a raster path fast enough to work in,
  and a path tracer that is the honest answer the raster is held to. Where
  they disagree, the tracer is the reference and the raster is corrected,
  and the checks that catch a disagreement stay in the test suite.
- The picture reads as a thing on a bench: a table with a real surface, a
  cushion the piece sinks into, daylight or a studio rig with each light
  carrying its own shadow, a camera with a lens in millimetres.
- The renderer is a library as well as a page, and since September 2026 a
  separate repository — `artshape-render` — that this project consumes
  like any other user. Anything at millimetre to metre scale that stands
  still on a surface — a mathematical sculpture, a puzzle box with moving
  parts, a maker's own catalogue — can be drawn by it without the editor.
  Nothing in it may know about jewellery, about an editor, or about a
  particular page: a catalogue of sketches, a parts picker and a DOM
  beyond the viewer's canvas all belong to an application.

Success is a jeweller sketching a brooch in an evening, turning it in the
light, and trusting the picture enough to make it; and a programmer using
the renderer for a sculpture in an afternoon.

## Affected users and systems

- The owner, designing pieces and driving the project.
- Jewellers and makers who sketch in the language; they are not
  programmers, and the language's words are theirs (pitch, roll, fasten,
  band, shank), not a graphics library's.
- Programmers using the renderer as a library, with their own meshes and
  units, on a page or headless.
- The systems: the DSL and its editor, the parts catalogue and mesh
  generators, the assembly, the two renderers over raw WebGPU, the bakes,
  and the test suites, node and headless Chrome.

## Constraints

- **Correctness is measured, not asserted.** A rendering change is held
  to the tracer, or to a known answer, before it is kept; a change that
  cannot be measured is described as unverified. The furnace, the
  raster-versus-traced comparisons and the headless suite exist for this.
- **Speed first while working.** Draft quality is the default; an edit
  shows within a frame; bakes are chunked, debounced or moved off the
  thread rather than allowed to freeze the page. Final and traced quality
  are opt-in.
- **Everything procedural.** No texture assets; materials, patterns,
  lettering and tables are functions, so a piece is the sketch and
  nothing else needs shipping.
- **Millimetres are the native unit**, and the renderer converts through
  one number where another unit is wanted; nothing fixed in real size may
  bypass it.
- **Raw WebGPU, no engine.** A thin device layer; the renderer talks to
  the API. No scene graph, no animation system, no culling: this is a
  still-life renderer and should stay one until an application needs more.
- **The language stays small and the words stay the maker's.** A new part
  is added when a real piece needs it; a new builtin name must not shadow a
  word a sketch would naturally use.
- **The roadmap is the record.** What was built, what was measured, what
  was tried and taken out, and why — written as it happens, with numbers.

## Open questions

- The first real user of the library beyond jewellery turned out to be a
  chess game, which wanted a pool of placements that move rather than a
  still piece; that is what `moveAll` and per-group draw counts came from.
  It has not yet forced a scene graph, and the question stands for
  whatever comes next: does an application with real motion in it make one
  necessary, or is a pool of matrices enough?
- How far should raster realism be pushed against the tracer: is a
  filtered table reflection for satin metal worth its cost, or is traced
  quality the answer for the final picture?
- Is a photograph-quality output the goal, or a drawing a jeweller trusts?
  The film pass and the tables say photograph; the language says drawing.
- Who besides the owner writes sketches, and what does the editor need
  before they can: sharing, a gallery, printing a sketch with its picture?
