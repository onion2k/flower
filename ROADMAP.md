# Roadmap

Long-term directions for the app, assessed against the pipeline as it stands
in September 2026. This is a reference for choosing what to build next, not a
schedule. Items are ordered from cheapest to dearest; the infrastructure list
at the end is the shared work the items imply.

## What the pipeline already gives us

These four facts decide which items are cheap.

- **Every part is a plate, sweep, or revolve** built from a 2D outline
  (`geom/outline.ts`), a cross-section profile (`geom/profile.ts`), or a curve
  (`geom/curve.ts`). New shapes are mostly new outlines and curves, not new
  mesh code.
- **One PBR shader draws everything procedurally.** No textures beyond the
  environment, shadow map, and BRDF lookup. Metals, nacre, gems, plastics, and
  wood are `model` enum cases in one `Material` uniform (`render/shaders.ts`).
- **The shader already engraves per pixel.** Chased relief on plates is a
  height field evaluated in the plate's flat coordinates, with the normal bent
  by its gradient. The vertex normal carries no relief. That mechanism
  generalises to any engraved pattern and survives curl and cup deformation.
- **HDR with bloom** is in place (`render/post.ts`), so anything that emits
  light glows for free.

Symmetry is a list of matrices (`pattern/symmetry.ts`); repetition costs no
geometry.

## Items, cheapest first

### 1. Geometric forms and art deco

**Cost: low. Almost pure content.**

Outlines already include polygons, stadiums, tombstones, gussets, and bolt
circles. Deco wants fans, chevrons, stepped ziggurats, sunbursts, keystones,
and stacked concentric plates.

- New outline functions in `geom/outline.ts`: `fan`, `chevron`, `sunburst`,
  `ziggurat`, `keystone`, `scallop`.
- A generic `plate(outline: ..., thickness, bevel)` DSL builtin that accepts an
  outline value, so shapes are data rather than new files under `src/parts/`.
- A `step` or `stack` extrude option for terraced plates (a ziggurat is a stack
  of shrinking plates; stacking them as separate placements works today but
  doubles the cap triangles).
- `radial`, `nested`, and `ring` symmetries do the repetition already.

No shader work.

**Status, September 2026:** the outlines (fan, chevron, sunburst, ziggurat,
keystone, scallop, lozenge, plus polygon, roundel, stadium and card) and the
`plate` builtin with `cut`, `bore` and `enamel` are in; see the `deco` example
sketch. Outlines are a DSL value kind of their own, with completions. The
stepped extrude option is not done; a ziggurat is a stacked set of plates
for now.

### 2. Math curves and surfaces

**Cost: low for curves, moderate for surfaces.**

- Curves: Lissajous, rose, sine ribbon, torus knot, superellipse. One function
  each in `geom/curve.ts`, one `define` each in `dsl/builtins.ts`. `sweep` and
  the `along` symmetry consume them unchanged.
- Surfaces: a parametric mesh generator `mesh/surface.ts` taking
  `f(u, v) -> Vec3` and emitting a grid through `MeshBuilder.grid`. Covers
  saddles, Möbius bands, seashell surfaces, and bezier patches. Give it a
  thickness option (offset along the normal and stitch the rim) so the result
  is a solid shell, not a sheet.
- Bezier patches need a control net authored in the DSL. The DSL has vectors
  and lists of numbers but no nested list or matrix literal. That grammar
  addition is the one real cost here.

**Status, September 2026:** the curves are in — `lissajous`, `rhodonea` (the
rose curve; `rose` is a gem cut and so a bare word), `sine`, `knot` (torus
knot) and `superellipse` — see the `trefoil` example. The parametric surface
generator and the control-net literal are not done.

### 3. Engraved patterns

**Cost: moderate, all in the shader. The template exists.**

Generalise the chased-relief path:

- Replace the single hard-coded vein field (`reliefField`) with a small set of
  fields selected by a `pattern` enum in `Material`: guilloché, hatching,
  cross-hatch, basketweave, deco fan, wave, stipple. Keep the vein field as
  case 0.
- Each pattern needs two or three scalars (scale, depth, angle). Reserve a
  `vec4f` for them rather than adding named uniforms per pattern.
- Plates already carry flat coordinates (`plate`) on their caps. Sweeps and
  revolves need an equivalent; their `uv` is already arc length along and
  around, which is the right coordinate. Replace the `abs(cap) > 0.5` gate
  with a per-vertex "has engraving coordinates" flag that every part type
  sets.
- Patterns compose with enamel: engraved metal showing through translucent
  enamel is basse-taille, and the existing enamel opacity path handles it.

Do this before item 5; glyphs then reuse the depth path.

**Status, September 2026:** done. `part x = ... engraved hatch(scale, depth,
angle)` cuts any of seven patterns (hatch, crosshatch, guilloche,
basketweave, rays, wave, stipple) into any part. The design differs from the
sketch above in one way: instead of a per-vertex flag, every mesh carries a
second coordinate set in millimetres (`Mesh.engrave`) — flat coordinates on a
plate's caps, arc length and perimeter on a sweep, angle times local radius
and silhouette distance on a revolve — and the viewer derives one from uv and
extent for anything else. Plates engrave their caps only. The pattern fades
out as its pitch approaches a pixel. See the `engraved` sampler and the
`deco` brooch. Glyphs (item 5) should evaluate their distance field in the
same coordinates and go through `engraveHeight`.

### 4. Natural forms

**Cost: low to moderate. Mostly content, one new symmetry.**

Leaves, petals, stems, and bouquets exist. The gaps:

- Shells: a revolve along a log spiral with a growing profile. Needs `revolve`
  to accept a curve for its axis, or a dedicated `shell` part built on `sweep`
  with a scaling profile.
- Seed pods and buds: closed revolves with ribs, largely done via existing
  `pod` and `bead`.
- Branching: a recursive symmetry the DSL cannot express yet. Add a
  `branch(depth, count, spread, shrink)` builtin that produces a matrix list,
  the way `phyllotaxis` does. Twig geometry is a tapered `wire`.

### 5. Runes, kanji, and glyphs

**Cost: moderate to high. The first mechanism we do not have: an image on the
surface.**

Two routes, in order:

- **Procedural glyphs** (runes, simple geometric alphabets): a glyph is a
  handful of line segments. Evaluate a signed distance to them in the shader
  and feed it through the engraving path from item 3. Glyph tables live in a
  uniform or storage buffer. No textures.
- **Font glyphs** (kanji, any real typeface): render the glyph to a signed
  distance field on the CPU via canvas, upload it as a texture, sample it in
  the shader, and depth it through the same engraving path. Needs:
  - a texture binding and sampler in the material bind group (group 1);
  - an atlas builder that packs the glyphs a sketch uses;
  - a uv layout choice: where the glyph sits on the part (centred on a cap,
    wrapped round a band, repeated along a sweep).

The DSL surface is `engrave text: "..." font: ... size: ...` on a part, plus
`glyph: rune-name` for the procedural set.

### 6. Light tape, neon, and diodes

**Cost: low for the glow, high for cast light and shadow.**

Geometry is trivial: a swept tube for neon and tape, a small revolved dome for
a diode. The work is in lighting.

- **Emissive model**: a new `model` case in `Material` with an emission colour
  and strength. Bloom makes it glow. Ship this first; it gets most of the
  look.
- **Unshadowed local lights**: a per-frame array of point lights (position,
  colour, radius) sampled in the fragment shader. Diodes become one light
  each. A neon tube becomes a few samples along its path. Cheap and
  convincing at jewellery scale.
- **Shadowed local light**: the rule in `lighting-and-camera` stands: each
  light carries its own shadow. A shadowed line light needs a second shadow
  map and a cube or dual-paraboloid projection. Treat this as its own project
  after the two steps above.

The light array is a new uniform buffer; the frame struct grows.

### 7. Silk and velvet, with deformation

**Cost: moderate for the shading, high for the deformation. Leave last.**

- **Velvet**: a sheen term (retroreflective fuzz, Charlie or Ashikhmin cloth
  lobe) over a coloured dielectric. The `flock` finish is a crude stand-in.
  Add `velvet` and `silk` as table types in the `Ground` shader beside oak,
  walnut, slate, and linen; the picker already exists.
- **Silk**: anisotropic sheen with a dielectric F0, close to the `brushed`
  finish already in the metal path. Weave direction from the ground's scale
  parameter.
- **Deformation**: the table is one procedural plane and knows nothing about
  the piece. Cheapest convincing route: render the piece's depth from above
  (the shadow map machinery already does this), blur it into a heightfield,
  and displace and re-light the ground with it. That gives a dimple and a
  soft crease round a ring without a cloth solver. A real solver is not worth
  it for a still image.

## Infrastructure the list implies, in order

1. **Generic outline and `plate` builtin** in the DSL. Unblocks 1, and makes
   every later geometric part data instead of code. Done.
2. **Parametric surface generator** beside extrude, sweep, and revolve.
   Unblocks 2, helps 4. Curves done; surfaces not.
3. **Generalised engraving field** in the shader, keyed by an enum, with a
   flat surface coordinate on every part type. Unblocks 3 and 5. Done.
4. **Texture binding in the material bind group** plus an SDF atlas builder.
   Unblocks font glyphs in 5.
5. **Emissive model**, then a local light array. Unblocks 6.
6. **Cloth table types**, then a displacement heightfield baked from the
   piece. Unblocks 7.

### The shared bottleneck

Items 3, 5, 6, and 7 all add uniforms to `Material` or `Frame`. WGSL struct
layout and the matching TypeScript packing are hand-maintained, and every
addition has cost a relayout. Item 3 used 32 of the 80 spare bytes at
the end of the record (`pattern`, `patternFaces`, two pads, `patternParams`);
48 remain before the 256-byte stride is full, enough for emission and a glyph
selector. Fill them as items land rather than relaying out each time.

### DSL grammar changes

Collected here because they are easy to forget:

- Nested list or matrix literal (bezier control nets, item 2).
- String literal (engraved text, item 5). The lexer has none today.
- Recursive symmetry builtin returning a matrix list (branching, item 4).

## Suggested first three

1. Deco outlines and the generic `plate` builtin. A week of content work
   with immediate visible results.
2. Math curves. A day. Lissajous and rose curves through the existing sweep
   and `along` give striking pieces at once.
3. Generalised engraving. The one shader change that pays off three times
   (patterns, procedural glyphs, basse-taille enamel).
