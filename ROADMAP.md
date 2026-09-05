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
stepped extrude was done later: `plate(..., tiers: n, shrink: f)` stacks
tiers shrunk about the centroid as one watertight mesh (`extrudeStepped`),
each tier's tread an annular cap, no hidden faces, engraving continuous
across the treads.

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
knot) and `superellipse` — see the `trefoil` example. The surfaces followed:
`mesh/surface.ts` thickens any f(u, v) into a shell with rims on its open
edges and none on closed ones (a Möbius band closes on itself with a flip
and needs nothing more), and `saddle`, `ripple`, `helicoid`, `mobius`,
`seashell` (`shell` is the symmetry) and `patch` are parts with face and
back anchors. No control-net literal was needed: `patch` takes its sixteen
points as plain arguments. See the `solids` example.

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

**Status, September 2026:** done, with one mechanism for both routes. A
signed-distance atlas (`render/glyphs.ts`) is rasterised on a canvas — real
fonts through fillText, so kanji work through the system's fallback fonts,
and Elder Futhark from a stroke table so runes never depend on a font — and
read in the shader through the engraving coordinates and the same normal
bend as the patterns. `engraved text("1928", size, depth, angle, at, font)`
and `engraved runes("odin", ...)`; a part may carry a pattern and lettering
together. `at` is an offset from the middle of the face. The cut's floor is
darkened and roughened so letters read as cut rather than outlined. Lines
do not wrap round a closed sweep's seam. See the `inscribed` example.

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
  after the two steps above. Done: see the status below.

The light array is a new uniform buffer; the frame struct grows.

**Status, September 2026:** the first two steps are done. Thirteen light
materials — eight neons and five diodes, e.g. `in pink neon`, `in amber
diode` — shade as a glass skin over their own radiance (`model: 'light'`,
`glow` in sky units), bloom, and become unshadowed sphere lights: every
placement of a glowing part is sampled as up to six spheres down its longest
axis, each carrying its share of the surface area as radiant intensity, into
a 48-light uniform buffer at frame binding 7. Both the piece and the table
take diffuse and a representative-point GGX highlight from them. The
shadowed local light was done afterwards, see below. Brightness is controllable
twice over: `glow n` after a part's material (or on a placement) sets its
radiance in sky units, and a glow slider in the light panel scales every
emitter, 0 putting them out. See the `neon` example. The material record is
now full (256 bytes).

**Shadows, September 2026:** the local lights now cast shadows. Because the
lights are part of the piece, their shadows are still: each of the first 32
sampled lights gets six 160² depth faces in one 2D-array texture (frame
binding 8), rendered with the depth-only pipeline whenever the piece or the
lights move, skipping the emitter's own part (the sample sits inside the
tube). The lookup picks the face by major axis from the same face table the
bake used, so no cube-map convention is involved, and filters five taps.
Both the piece and the table read it through `localLights()`. Two lessons:
a depth-only pass must bind a stand-in for the array it is rendering into,
and `ref` is a reserved word in WGSL.

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

**Status, September 2026:** done, by a cheaper route than the one above.
`velvet` and `silk` join the table picker. Velvet is a near-black navy pile
with a Charlie sheen lobe for the key and a grazing-only sky sheen — the
sky's irradiance is about six times unity in these scenes, so any constant
sheen term lights the whole cloth. Silk is an ivory satin with the highlight
bent along its floats and a faint thread ribbing. The deformation needed no
new bake: the ground already carries the occlusion texture of the piece
over it, and the cloth's normal is tilted by the gradient of that footprint
with the floor of the dip self-shaded. It is a tilt, not a displacement, so
the cloth never rises up the side of a part.

**Revised:** that read as a flat rigid plane, so the cloths are now cushions
(`render/cushion.ts`). The ground is a 256² grid; the piece is rendered
straight down into a depth map; four min-plus sweeps turn that into a
draped "cone" (the cloth no higher than any part's underside, nor higher
than that plus a slope times the distance away); the result is capped by a
plump rounded-square dome and written to a height map the ground's vertex
shader displaces by and its fragment shader takes normals from. A piece
sinks into the pillow by the cushion's puff. Outside the rim the ground
shades as the matte table. Baked whenever the scene, occlusion or table
changes; ~5 compute passes over 512², cheap.

## Infrastructure the list implies, in order

1. **Generic outline and `plate` builtin** in the DSL. Unblocks 1, and makes
   every later geometric part data instead of code. Done.
2. **Parametric surface generator** beside extrude, sweep, and revolve.
   Unblocks 2, helps 4. Done.
3. **Generalised engraving field** in the shader, keyed by an enum, with a
   flat surface coordinate on every part type. Unblocks 3 and 5. Done.
4. **Texture binding in the material bind group** plus an SDF atlas builder.
   Unblocks font glyphs in 5. Done.
5. **Emissive model**, then a local light array. Unblocks 6. Done.
6. **Cloth table types**, then a displacement heightfield baked from the
   piece. Unblocks 7. Done, with the existing occlusion bake as the field.

### The shared bottleneck

Items 3, 5, 6, and 7 all add uniforms to `Material` or `Frame`. WGSL struct
layout and the matching TypeScript packing are hand-maintained, and every
addition has cost a relayout. Items 3 and 5 used 64 of the 80 spare
bytes at the end of the record (pattern selector and params, glyph range,
letter params); item 6 took the last 16 for emission. The record is full:
the next field means growing `MATERIAL_STRIDE` past 256.

### DSL grammar changes

Collected here because they are easy to forget:

- Nested list or matrix literal (bezier control nets, item 2). Avoided:
  sixteen plain points serve.
- String literal (engraved text, item 5). The lexer had one already.
- Recursive symmetry builtin returning a matrix list (branching, item 4).

## Suggested first three

1. Deco outlines and the generic `plate` builtin. A week of content work
   with immediate visible results.
2. Math curves. A day. Lissajous and rose curves through the existing sweep
   and `along` give striking pieces at once.
3. Generalised engraving. The one shader change that pays off three times
   (patterns, procedural glyphs, basse-taille enamel).
