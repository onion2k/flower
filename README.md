# artshape

[![Check](https://github.com/onion2k/flower/actions/workflows/check.yml/badge.svg)](https://github.com/onion2k/flower/actions/workflows/check.yml)

A sketchbook for jewellery and other small made things. A few lines
describe a piece in a jeweller's own vocabulary — parts, joins,
symmetries, metals and finishes — and it is drawn at once as a
photograph would show it, on a table, in light you can move.

    # A rosette: eight pierced leaves, studded, with a curl between each
    material gold polished

    part petal = leaf(length: 34, width: 15, thickness: 1.1, piercings: 3, boss: 2.4)
    part stud  = rivet(head: 3.6, height: 1.2, shank: 2.2, grip: 1.1) in rose gold polished
    part curl  = wire(path: spiral(start: 1.1, turns: 1.25, growth: 3), radius: 1, tip: 0.15, sections: 120)
    part heart = bead(radius: 7.2, point: 5.5) in rose gold satin

    unit sector {
      place petal
      fasten stud to petal.boss
      place curl at (9, -5.5, 1.4) turn -29deg
    }

    form rosette {
      repeat sector around ring(8, radius: 5.5)
      place heart at (0, 0, 1.9)
    }

That is the `rosette` example, whole, as the picker opens it.

The drawing is [artshape-render](https://github.com/onion2k/artshape-render),
a dependency: the parts, the assembly, the language and the renderer over
raw WebGPU. What is in this repository is the sketchbook around it — the
editor, the catalogue of examples, and the page.

    npm install
    npm run dev

Needs WebGPU: a current Chrome, Edge or Safari.

## Working in it

**The subject picker** holds 142 things in three kinds. *Sketches* are
written in the language and open in the editor. *Forms* are five pieces
built through the TypeScript builder rather than the language; the rosette
exists both ways, and a script asserts that every placement matrix comes
out bit-identical, so if the two front ends ever start meaning different
things it is caught. *Parts* are the catalogue one at a time — a
tendril, a pierced leaf, a rivet, a collar — for seeing what a part does
before putting it in something.

**Every number in a sketch can be scrubbed.** Hold ⌥ and drag a number
and the piece follows the pointer; ⌥↑↓ nudges it, ⇧ makes the step
coarser and ⌘ finer. The strip under the editor names the call the cursor
is in and every argument it takes, including the ones left unwritten and
what they default to.

**Click the piece and the editor follows.** A part under the pointer is
picked on the CPU and the source that placed it is selected — the
innermost span, so clicking a stud selects the stud rather than the
sector it sits in.

**The panel is a photographer's, not a modeller's.** Metal and finish;
an environment or a loaded HDRI, a key light you can move with its own
soft shadow, and a studio rig beside it; a table in matte, oak, walnut,
slate, linen, velvet or silk; a lens in millimetres, a horizon tilt, a
shift, and a focus that can be shown as peaking; and a film pass — tonemap,
vignette, grain, fringe, depth of field.

**Draft quality is the default**, because an edit should show in a frame.
Final is for looking at, and traced hands the still view to a path tracer
that converges while nothing moves. The renderer measures the machine it
is on and holds the picture to what that machine can draw; the `gpu` row
in the stats says what it found, and clicking it copies a report.

**Sketches you write are yours.** *Save as…* keeps one in the browser
under a name, *export* writes it to a text file, *import…* reads one
back. An edit to a built-in example is kept as a draft beside it, and
*reset* throws it away.

## How it is put together

    src/main.ts    the page: the panels, the pointer, the stats
    src/editor/    CodeMirror, the scrubbing, the help strip, the palette
    src/examples.ts   the sketches the picker offers
    src/spike/     the forms and the parts catalogue, and scripts for
                   looking at an assembly by hand

The renderer is not here. A change to the language, the parts, the
assembly or the drawing belongs in `artshape-render`, and is held to a
higher bar there — to the path tracer, or to a known answer.

To work on both at once, link the library rather than fetching the
pinned tag:

    cd ../artshape-render && npm link
    cd ../artshape && npm link artshape-render

The dev server is already configured to serve a linked checkout from
outside this project, which is the one thing linking costs.

## The documents

INTENT.md says why the project exists, what it is for, and the
constraints every change keeps — read it before planning anything larger
than a fix. ROADMAP.md is the record of what was built and measured, what
was tried and taken out, and what is open, written with numbers as it
happened. TESTING.md says how the suites run and what they cover.

## Checking it

    npm test        the editor, the examples, the chess set as a chess set
    npm run build   typechecks, then bundles

Both run on every push. The renderer's own suites — 880 in node and 28 in
headless Chrome against a real device — live in its repository and run
there.
