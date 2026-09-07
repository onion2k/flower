# artshape

[![Check](https://github.com/onion2k/flower/actions/workflows/check.yml/badge.svg)](https://github.com/onion2k/flower/actions/workflows/check.yml)

A sketchbook for jewellery and other small made things. A few lines
describe a piece in a jeweller's own vocabulary — parts, joins,
symmetries, metals and finishes — and it is drawn at once as a
photograph would show it, on a table, in light you can move.

    material gold polished

    part band  = shank(size: 17, width: 2.6, thickness: 1.8, shoulder: 0.55)
    part mount = setting(width: 7, style: claw, claws: 6, height: 3.2)
    part stone = gem(cut: brilliant, width: 7) in diamond

    form ring {
      place band
      fasten mount to band.crown
      fasten stone to mount.seat
    }

That is the `ring` example, less the comment it opens with. `size` on a
shank is the inner diameter — the finger it has to fit round, which is the
one measurement a ring actually answers for — and the rest is built
outward from it. `fasten` puts a part on a named anchor of another: the
setting on the band's crown, the stone on the setting's seat.

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

    src/main.ts     the page: the panels, the pointer, the stats
    src/editor/     CodeMirror, scrubbing, the help strip, the palette
    src/examples.ts the sketches the picker offers
    src/spike/      the forms, the parts catalogue, and scripts for
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

    npm test       the editor, the examples, the chess set as a chess set
    npm run build  typechecks, then bundles

Both run on every push. The renderer's own suites — 880 in node and 28 in
headless Chrome against a real device — live in its repository and run
there.
