# Roadmap

Written in September 2026 as a plan for eight long-term directions, and
rewritten at the end of that month when all eight were in. It now records
what each became, the decisions worth knowing before touching them, and
what is still open. The original plan's reasoning is kept where it still
explains the shape of the code.

## What the pipeline gives us now

- **Four ways to make a mesh.** A plate from a 2D outline (`extrude`, and
  `extrudeStepped` for tiers), a sweep of a profile along a curve, a
  revolve of a silhouette, and a parametric sheet thickened into a shell
  (`mesh/surface.ts`). New shapes are mostly new outlines, curves and
  functions, not new mesh code.
- **Every mesh carries surface coordinates in millimetres** (`Mesh.engrave`)
  beside its 0..1 uv: flat coordinates on a plate's caps, arc length and
  perimeter on a sweep, angle times local radius and silhouette distance on a
  revolve, arc lengths on a sheet. Anything drawn on a surface — patterns,
  lettering — is drawn in these, so a groove is the same width on a plate, a
  wire and a bead.
- **One PBR shader draws everything**, procedurally except for two textures:
  the glyph atlas and the local shadow array. Metals, nacre, gems, plastics,
  wood and lights are `model` cases in one `Material` record, which is full
  at its 256-byte stride.
- **The shader engraves per pixel.** A height field in surface millimetres,
  its gradient bending the normal: the chased vein relief, seven patterns,
  and lettering from a signed-distance atlas all go through the same bend.
- **Lighting**: a baked environment, one movable key with a shadow map, and
  the piece's own lights, sampled as spheres along every glowing part, each
  with its own six-face shadow, on both the piece and the table.
- **The table is geometry.** A 256² grid, flat for the hard surfaces and
  displaced by a baked height map for the cloth cushions.
- **Symmetry is a list of matrices**, now including a recursive one, and any
  number in a sketch can carry play (`rnd`) that the growers draw from.

## What was built

### 1. Art deco and geometric forms

Outlines are a value kind of their own in the sketch language: `fan`,
`chevron`, `sunburst`, `ziggurat`, `keystone`, `scallop`, `lozenge`,
`polygon`, `roundel`, `stadium`, `card`. `plate(outline, thickness, cut,
bore, bevel, enamel, tiers, shrink)` extrudes one — flat, or as a ziggurat
of tiers shrunk about the centroid, built as one watertight mesh with each
tier's tread an annular cap and no hidden faces. Examples: `deco`.

Worth knowing: an odd blade count puts a trough, not a crest, on a fan's
centre line; `ziggurat`'s `steps` count includes the top slab.

### 2. Curves and surfaces

Curves: `lissajous`, `rhodonea` (the rose curve — `rose` is a gem cut and so
a bare word), `sine`, `knot`, `superellipse`; any wire, blade or `along`
takes them. Surfaces: `saddle`, `ripple`, `helicoid`, `mobius`, `seashell`
(`shell` is the symmetry) and `patch`, each a shell with face and back
anchors, taking thickness, enamel and engraving like a plate. The generator
rims open edges and leaves closed ones alone; a Möbius band closes on itself
with a flip and needs nothing more. `patch` takes its sixteen control points
as plain arguments, so no nested-list literal was needed. Examples:
`trefoil`, `solids`.

### 3. Engraved patterns

`part x = ... engraved hatch(scale, depth, angle)` with hatch, crosshatch,
guilloche, basketweave, rays, wave, stipple. Plates engrave their caps only;
the pattern fades to plain metal as its pitch nears a pixel. Under a
translucent enamel it is basse-taille. Examples: `engraved`, `deco`.

Worth knowing: on a tapering revolve the angle-times-radius coordinate
shears row to row (the "pineapple" diagonal on a stippled bead). Centring
the seam halves it; it cannot go without stretching the pattern.

### 4. Natural forms

Shells came with the surfaces. Branching is the `tree` symmetry (`branch`
is a part): `tree(depth, count, length, spread, shrink, twist, tips, phase)`
places a twig at the tip of every twig, each child in its parent's frame so
shrink compounds, and `tips: yes` one level deeper than the twigs puts buds
at their ends (author them large: they are shrunk as many times). With
`rnd()` in its measures every fork is its own. Examples: `coral` (a flat
fork of two), `bonsai` (three limbs a fork, twisted, in three dimensions).

### 5. Lettering: runes, kanji, glyphs

One mechanism for both routes the plan considered: a signed-distance atlas
rasterised on a canvas — real fonts through fillText, so kanji come through
the system's fonts, and Elder Futhark from a stroke table so runes need no
font — read through the engraving coordinates and the same normal bend as
the patterns. `engraved text("1928", size, depth, angle, at, font)` and
`engraved runes("odin", ...)`; a part may carry a pattern and lettering
together; `at` is an offset from the middle of the face. The cut's floor is
darkened and roughened so letters read as cut, not outlined. Example:
`inscribed`.

Worth knowing: a sweep's uv is left-handed, so its engraving coordinates
flip v to read the right way from outside; a line does not wrap round a
closed band's seam; the runes are approximations worth checking against a
reference for any you care about.

### 6. Neon, diodes, light tape

Thirteen light materials (`in pink neon`, `in amber diode`, …) shade as a
glass skin over their own radiance and bloom. Every placement of one is
sampled as up to six spheres of light down its length, each carrying its
share of the surface area, into a 48-light buffer; the first 32 get a
six-face depth cube each, baked when the piece or its lights change (they
never move relative to each other), with the emitter's own part left out.
Brightness: `glow n` after a part's material or on a placement, in sky
units, and a glow slider that scales them all. Example: `neon`.

Worth knowing: under the studio sky, whose irradiance is about six times
unity, a tube reads pastel — dusk shows it as neon. Metal has no diffuse
lobe, so a light shows on bare metal only as a specular streak; the example
gives its backplate a black enamel face for that reason. Lights beyond the
first 32 samples cast no shadow. The shadow softness is fixed.

### 7. Silk and velvet, as cushions

`velvet` and `silk` in the table picker are pillows: a plump rounded pad the
piece sinks into. Velvet is a near-black pile with a sheen that rises toward
grazing; silk an ivory satin with its highlight streaked along the floats.
The shape is baked (`render/cushion.ts`) from a depth render of the piece
straight down: a tight collar wherever a part touches (a steep min-plus cone
over eight directions), a broad sag from a tent-weighted blur of the
footprint counting only what comes down to the cloth, capped by the pad's
dome. So a plate presses the whole pad down, a ring sits in a shallow hollow,
a stem only dimples, and a canopy high above carries nothing.

Worth knowing: the first version tilted a flat plane's normals and read as
rigid; the second used one drape slope and dug a faceted pit under a trunk;
the third pressed the pad down under a whole canopy. Each was a real render
of a real case. The walls of a deep dip still show faint facets from low
angles.

### Play

`rnd(centre, spread)` is a number somewhere in centre ± spread. Where one
number is wanted it samples once (including `let` and arithmetic); `tree`
draws afresh per limb (length once per parent, since a twig is one mesh);
`jitter(symmetry, turn, tilt, shift, scale)` shakes any symmetry per copy.
Draws are seeded from the rnd's own numbers plus a sketch-wide `seed n`, and
each consuming parameter gets its own stream, so identical rnd()s agree —
leaves follow limbs — while a spread and a twist written alike do not move
in step. A sketch renders the same on every keystroke.

## Infrastructure as it stands

- `Material` is 256 of a 256-byte stride. The next field means growing
  `MATERIAL_STRIDE`, and the TypeScript packing in `writeMaterials()` with it.
- Frame group bindings: 0 frame, 1 environment, 2 BRDF, 3 sampler, 4
  occlusion, 5 key shadow, 6 comparison sampler, 7 lights, 8 local shadow
  array. Material group: 0 record, 1 glyph buffer, 2 glyph atlas. Ground
  group: 0 record (80 bytes), 1 occlusion, 2 cushion height.
- Draw groups are keyed on mesh **and** surface (metal, finish, enamel, vein
  metal, engraving, inscription, glow): memoised parts share one mesh object
  across materials, and grouping by mesh alone once gave the second part the
  first's material.
- Depth-only passes bind a stand-in for any array they render into, or
  WebGPU rejects the whole frame and everything goes dark.
- The language gained: outline, engraving, inscription and random value
  kinds; `engraved` and `glow` clauses; a `seed` statement. No new literals.

## Open

- A cushion whose collar softens with the cloth rather than a fixed slope,
  and more sweep directions for its facets.
- Lettering that wraps round a closed band's seam.
- Shadow softness that grows with a light's size.
- Per-placement geometry variation is not possible while placements share a
  mesh; size varies through shrink, shape does not.
- Growing the material record when the next material feature arrives.
