# Roadmap

Written in September 2026 as a plan for eight long-term directions, and
rewritten at the end of that month when all eight were in. A second phase,
realism, was planned and built in the same month, all nine items of it;
a third filled the catalogue of sketches; a fourth gave the camera its
own panel and a focus helper; a profiling pass then took the cost out of
final and traced quality. This records what each became, the
decisions worth knowing before touching them, and what is still open. The
original plans' reasoning is kept where it still explains the shape of
the code.

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
- **One material model, two renderers.** The raster shader draws the piece
  procedurally except for the glyph atlas and the shadow maps; metals,
  nacre, gems, plastics, wood, lights and enamel are `model` cases in one
  `Material` record. The path tracer (traced quality) walks a CPU-built
  BVH of every placement and shares that record and every field function,
  so relief, engraving, lettering and wires are the same code lit honestly.
  Where the two disagree, the tracer is the reference, and comparing them
  at the same pixels has found two lighting bugs already.
- **The shader engraves per pixel.** A height field in surface millimetres,
  its gradient bending the normal: the chased vein relief, seven patterns,
  and lettering from a signed-distance atlas all go through the same bend.
- **Lighting**: a baked environment (four presets or a loaded HDRI), a
  reflection probe of the piece and its table, one movable area key with a
  soft shadow and a studio rig of up to three more, each with its own
  shadow, the piece's own lights sampled as spheres along every glowing
  part with six-face shadows, per-pixel contact occlusion, and a film pass
  (AgX, grain, vignette, fringe, depth of field) at the end.
- **A camera** with a lens in millimetres, a horizon tilt, a lens shift,
  viewpoint presets, sliders that follow a drag, and focus peaking to show
  what is sharp.
- **The table is geometry.** A 256² grid, flat for the hard surfaces and
  displaced by a baked height map for the cloth cushions. The tracer takes
  it as a plane.
- **Three qualities.** Draft for working (a laptop screen's worth of pixels,
  a light bake), final for looking (a larger budget, supersampled once the
  view is still), traced for the honest answer (a sample per frame in
  bands, converging while the view is still).
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

- `Material` is 272 of a 512-byte stride (grown for the gem planes), so
  there is room for the next few fields.
- Frame group bindings: 0 frame, 1 environment, 2 BRDF, 3 sampler, 4
  occlusion, 5 key shadow, 6 comparison sampler, 7 lights, 8 local shadow
  array, 9 reflection probe, 10 contact occlusion, 11 rig shadow array. The
  frame uniform is 272 bytes of scene then three rig lights at 96 each. The
  group is visible to compute too, for the tracer. Material group: 0 record,
  1 glyph buffer, 2 glyph atlas, 3 gem planes. Ground group: 0 record (80
  bytes), 1 occlusion, 2 cushion height. The tracer's own groups: 1 the
  material records as one storage array of 512-byte slots plus glyphs and
  atlas, 2 the scene (params, nodes, triangles, positions, attributes, a
  uniform group table, inverses, the ground record, two accumulations, the
  output).
- The shader text is in pieces so the tracer can share it: `FRAME_STRUCT`,
  `COMMON`, `MATERIAL_STRUCT`, `MATERIAL_FIELDS`, `GROUND_STRUCT`,
  `TABLE_SURFACES`. Anything with a derivative (`dpdx`, `fwidth`) stays in
  the fragment shaders; the surfaces take a footprint as an argument
  instead.
- Storage buffers are limited to 8 per stage on the machines this runs on,
  and the tracer uses all of them. Anything more goes in a uniform.
- Draw groups are keyed on mesh **and** surface (metal, finish, enamel, vein
  metal, engraving, inscription, glow): memoised parts share one mesh object
  across materials, and grouping by mesh alone once gave the second part the
  first's material.
- Depth-only passes bind a stand-in for any array they render into, or
  WebGPU rejects the whole frame and everything goes dark.
- The language gained: outline, engraving, inscription and random value
  kinds; `engraved` and `glow` clauses; a `seed` statement. No new literals.

## Second phase: realism

Assessed late September 2026, with the first phase complete, and built over
the days that followed. What the renderer did at the time: a procedural
analytic sky at 512², split-sum image lighting, one area key with a soft
shadow, the piece's own lights with shadow cubes, per-vertex baked sky
occlusion, faked gem interiors, an ACES-fit tonemap with a 2.2 gamma,
bloom, depth of field and 4x MSAA. It was nice; it was not real.

### Why it reads as CG

1. **Nothing reflects anything but the sky.** A gold ring never shows its
   own stone, the table never appears in its lower half, the cushion is in
   no polished surface. On close-up metal this is where realism lives.
2. **The sky is synthetic.** Analytic softboxes make clean, structureless
   reflections. Real studios have edges, windows and a room.
3. **Contact is soft.** Occlusion is per vertex, so a rivet meeting a plate
   or a stone in its seat has no crisp contact shadow, and no light bounces
   colour between parts.

### The theme

The scene is static and small, so nearly everything expensive can be baked
once per edit rather than paid per frame — the way the light shadows and the
cushion already are. WebGPU is not the limit; per-frame budget is, and the
bake sidesteps it.

### Changes, in order

| # | Change | Gain | Cost |
|---|---|---|---|
| 1 | **Local reflection probe.** Bake a cube map at the scene's centre whenever the piece changes, prefilter it with the existing environment pipeline, sample it with parallax correction blended with the sky. Metal reflects the piece and the table; its irradiance gives one bounce of colour bleed for free. | Largest single jump | Moderate, mostly reuse |
| 2 | **Load a real HDRI.** Parse a Radiance file into the existing prefilter, with rotation. Structured reflections in polished metal. | Large | Low |
| 3 | **Ray-traced gems.** The cuts are generated, so each stone's facet planes are known: intersect the ray with them in the shader for two or three bounces — true refraction, total internal reflection, dispersion — replacing the fake interior. | Large for stones | Moderate |
| 4 | **Camera and film.** AgX or a true ACES transform instead of the fit, an sRGB curve instead of 2.2, a gentle vignette, film grain, a trace of chromatic aberration at the edges. | Medium, cheap | Low |
| 5 | **Per-pixel contact occlusion.** GTAO from the depth and normal buffers over the baked per-vertex term. | Medium | Moderate |
| 6 | **Micro-detail on metal.** Fine polish swirls, smudges, dust on the cushion; procedural like the existing micro-variation. | Medium on close-ups | Low |
| 7 | **Supersampled final.** Render final quality above native resolution and downsample. | Small but visible | Trivial |
| 8 | **A studio rig.** Fill and rim lights beside the key, as presets; the key machinery exists. | Medium | Low to moderate |
| 9 | **A progressive path tracer for final quality.** A BVH built on the CPU, a compute shader accumulating samples while the view is still, the raster path kept for editing. Interreflection, soft shadows, refraction and bounce become exact. | The real answer | High, but bounded |

### What each became

- **2, HDRI (September 2026):** `render/hdr.ts` parses Radiance files
  (run-length and flat); `bakeEnvironment` takes an `image` and draws the
  cube from it with an equirect lookup (+Z up, horizon in the middle) before
  the same mip chain, GGX prefilter and readback. The image is uploaded as
  half floats so it filters; a loaded probe is scaled by its mean radiance
  to the studio preset's (1.08), so exposure means the same under both. A
  "load HDRI…" button in the light panel adds `image` to the environment
  picker. The key light stays a separate light: a probe has no sun of its
  own.
- **4, film (September 2026):** the composite pass gained AgX (Sobotka's
  base look, inset/outset matrices, the sigmoid fit) beside the ACES fit, a
  real sRGB curve instead of a 2.2 power, a vignette, pixel-fixed grain that
  weakens in the highlights, and lateral fringe. A Film panel: tonemap,
  vignette, grain, fringe. The page colour behind the piece is inverted
  through whichever tonemap is active (AgX by iteration, since it mixes
  channels), so it still comes out as itself. AgX renders bright gold as a
  paler champagne — its rolloff — where ACES keeps it saturated; both are a
  click apart.

- **1, reflection probe (September 2026):** the lit scene is drawn from
  just above the piece into six 256² faces whenever anything that shows in a
  reflection changes (piece, materials, lights, key, sky, table, occlusion),
  filtered by roughness with the sky's own pipeline (`filterCube`), and read
  everywhere the sky was read (`reflectionAt`, `irradianceAt`) with parallax
  against a sphere of the scene's size, blending back to the sky where the
  probe saw nothing. Alpha is made a hit mask on the way in: the scene writes
  distances there for the depth of field. Two lessons: the probe must stand
  in clear air — the scene's centroid is often inside a stone, and a probe
  drawn from inside a gem fills every reflection with the inside of a gem;
  and single-sample variants of the scene pipelines were needed, since the
  main ones are multisampled. Gold on oak now takes the oak; a ring's
  underside takes the velvet. One bounce: the probe does not see itself.
- **3, traced gems (September 2026):** every facet of a cut is recorded as a
  plane by the generator (`Part.gemPlanes`, ~130 for a brilliant since each
  antiprism triangle is its own), packed into a storage buffer at material
  binding 3, and `gemTraced` runs three channels through the convex stone:
  Fresnel at entry, up to five internal bounces with total internal
  reflection and Beer's-law absorption judged over the stone's width, and
  each escape looked up in the probe and sky. The material record grew to a
  512-byte stride for the plane range and size. Cabochons keep the folded
  approximation. A brilliant now shows real facet structure and fire, with
  its table's oak seen through the pavilion.

- **5, contact occlusion (September 2026):** `render/ao.ts`. Each frame the
  piece and the table are drawn depth-only at render resolution (the scene's
  own depth is multisampled and discarded), a half-resolution pass samples
  four directions by six steps within 2.5 mm with a per-pixel turn, and a
  depth-aware 5×5 blur settles it. The shaders read it by pixel through
  frame binding 10 and fold it into the per-vertex occlusion, so it shades
  the sky's light and the specular occlusion the way the bake does; the key
  and the piece's own lights are shadowed separately and untouched. A
  `contact` slider in the light panel; 0 skips the passes. On bare metal it
  is subtle by nature — metal has no diffuse — and shows most on cloth and
  wood under the piece and inside a ring.
- **6, micro-detail (September 2026):** behind a `detail` slider in the film
  panel. Polished metal (roughness under 0.35) carries two families of fine
  buffing swirls, turned by a slow noise so they wander, that haze the
  highlight and bend the normal a hair along their grain, and slow blotches
  of handling oil that lift the roughness. The cloths carry a sparse scatter
  of pale dust flecks. All drawn from the part's own coordinates, so they
  stay put as it turns.

- **7, supersampled final (September 2026):** `PostChain.resize` takes a
  factor; in final quality the scene, its depth, bloom, depth of field and
  contact occlusion are all drawn at twice the canvas each way, and one box
  pass averages each block down before the film. The film — grain, vignette,
  fringe — stays per canvas pixel. The multisampler only ever settled edges;
  this samples the shading too, so engraving, wire and sparkle stop
  shimmering. Dropped where the frame would pass twice the pixel budget.

- **8, studio rig (September 2026):** the frame uniform carries up to three
  more disc lights (`RigLight`: direction, strength, colour, size, and its
  own view of the scene), each with a layer of a 1024² shadow array at
  binding 11, baked with the key's. The key's disc-light functions were
  made generic (`discSpecular`, `discDiffuse`, `discShadow` over either
  map) and `rigAt` sums the rig for the piece and the table. Presets in the
  panel set the rig round the key — fill, rim, three point, clamshell — and
  follow it when it moves. None is baked into the sky, so they need no
  rebake.

- **9, path tracer (September 2026):** `render/bvh.ts` flattens every
  placement into world-space triangles under a binned-SAH hierarchy;
  `render/tracer.ts` walks it in a compute shader, one sample per pixel per
  frame while the view is still, accumulating into a float texture and
  writing the mean into the post chain's scene target so bloom and the film
  follow. It shares the raster shader's material record and field functions
  (`MATERIAL_STRUCT`, `MATERIAL_FIELDS`, `TABLE_SURFACES` are now separate
  strings; the record is copied into a private `material` at each hit), so
  relief, engraving, lettering, wires, planishing, patina and wear are the
  same code. Materials: metal (GGX with VNDF sampling), enamel as a glass
  coat over its colour, nacre, plastic and wood, lights as emitters, stones
  as refractive dielectrics traced through their own mesh with absorption
  and per-path dispersion. The key, the rig and the piece's lights are
  sampled by next event; escaped rays read the prefiltered sky at the
  lobe's centre, as the raster does, which is a little blur for a picture
  that settles in a few dozen samples. A third quality, `traced`, in the
  panel; the raster path draws while the view moves. The table is a plane
  (a cushion's dome is not traced), and there are at most 256 groups.
  Finding: comparing the two paths exposed a probe bug — the env filter's
  mip downsample wrote alpha 1, so every probe read softer than a mirror
  reported a hit and dropped the sky. Fixed; the raster path is brighter
  from the environment than it had been since the probe landed.

### How it went

The plan said items 1–8 would each patch one symptom of not tracing rays,
stack, and plateau below what 9 gives, and that was so. The suggested order
(2 and 4, then 1 and 3, then 5 and 6, 7, 8, 9) was the order built. Two
things the plan did not foresee:

- The tracer was worth building for the comparison alone. Its first
  pixel-by-pixel check against the raster path found the probe had been
  dropping the sky since it landed (the filter's mip downsample wrote alpha
  1), which none of the intervening captures had made obvious because the
  key carried the scene. With the sky back, the presets lit the piece like
  an overcast day — their irradiance is about three times the key's at its
  default — so the ambient default came down from 1 to 0.3, which keeps the
  key dominant and the table dark in all four presets; exposure stays at 1.
  The same comparison then found a second, older one: the environment's
  levels are GGX prefilters by roughness, not plain mips, and the footprint
  term chose the level whose *texel* matched the pixel, which on a small
  polished ring was a roughness-0.3 blur. Polished gold had read as satin
  from any distance for as long as that term existed. The footprint now
  maps to the roughness whose lobe is the pixel's cone (`sqrt(footprint)`),
  and the specular anti-aliasing measures the normal's variance against the
  mesh normal, so bumps count in full and curvature only a little. Comparing
  the two paths at the same pixels is the quickest way to catch this class
  of thing; keep doing it whenever the raster shading changes.
- Sharing the material code between the two paths, rather than writing a
  second material model for the tracer, cost one afternoon of splitting the
  shader text and repaid it at once: relief, engraving, lettering and wires
  came through the tracer unchanged. Keep it that way — a material feature
  added to `MATERIAL_FIELDS` reaches both; one added inside `fsMain` reaches
  only the raster.

Also from this phase, though not on the list: the cloisonné wire is now a
half-round bead of its own metal that flattens into roughness as it nears a
pixel wide, after the archvis lighting had left it a flat pale line.

### Open, from the second phase

- The tracer's table is a plane: a velvet or silk cushion's dome is not
  traced, so the traced and raster views of a cushioned piece differ.
- The tracer reads the sky prefiltered at the lobe's centre, and blurred
  further after a matte bounce, for speed. Importance-sampling the
  environment (a CDF over its brightest texels) would let it read the sky
  where a path actually went, at the cost of a slower settle.
- Caustics — a polished ring throwing light on the table — arrive as
  speckle and take hundreds of samples to smooth.
- The raster and traced paths still differ in places: the enamel's body
  reads brighter in the raster, the probe's one bounce is not the tracer's
  six, and the probe at 256² cannot show a band's inside reflected in its
  outside as the tracer does. Where they disagree, the tracer is the
  reference.
- Traced quality re-samples from nothing on any change to the frame, the
  exposure slider included, though the exposure is applied at the write.
- The tracer takes at most 256 draw groups, and the storage-buffer limit
  leaves no binding to spare.

## Third phase: the catalogue of sketches

Asked for at the end of September 2026, once the renderer was where it
needed to be: more examples, especially flowers, jewellery and art deco.
Twenty-nine were added, every one from parts the catalogue already had,
and the picker now groups them as Jewellery (23), Art deco (9), Flowers
(26), Foliage & seed, Weapons, Structures and Techniques.

- **Flowers:** lily, peony, lotus, snowdrop, sunflower, magnolia, dahlia,
  hydrangea, bluebell, crocus, calla, cherry.
- **Jewellery:** bangle, tiara, girandole, signet, eternity, halo, hoops,
  rivière, locket, cufflinks.
- **Art deco:** skyscraper clip, cocktail ring, mantel clock, powder
  compact, table lamp, scent bottle, cuff, vanity mirror.

`src/dsl/__tests__/examples.test.ts` compiles every example and checks the
groups, so a sketch cannot rot in the picker. Every new piece was drawn on
a contact sheet in the hidden pane and adjusted before it went in, and the
language did not need to change for any of them. What the round taught,
recorded here because the next round will want it:

- **Orientation words.** `pitch 90deg` maps +Z to +X and +X to −Z, so a
  fan plate pitched a quarter opens downward with its face forward, and a
  pendant drawn along +X from its ring hangs. `roll 90deg turn 90deg`
  stands a flat plate up with its outline's +Y as up and its face toward
  +X, where the default camera is; the composition is fixed (roll, then
  turn) whatever order the words are written in. A shank's crown is at the
  band's outer radius on +X, so a ring's head is built flat as a unit and
  pitched onto it.
- **What `along()` does.** Its path runs down a placed unit's local Y, with
  local X pointing sideways off the path; settings on a flat arc stay
  upright, and a chain is a two-link unit with the second link stepped
  along Y and pitched a quarter, repeated at half the count.
- **Flowers.** A bell is built mouth up, so turned over inside its unit it
  hangs from a raceme; a wire whose path already rises needs no tilt on a
  ring; a lily's recurve wanted width 17, cup 30 and curl −80 on a −36
  tilt; a sunflower's head is a unit pitched onto a stalk that bends
  through a right angle.
- **Gotchas.** A part name shadows a word (`part quill = petal(shape:
  quill)` fails); a mirror reflects the dark studio and reads as black
  glass; a step-cut aquamarine seen from the side does too, and moonstone
  reads as frosted glass instead.

## Fourth: the camera

Asked for after the catalogue: rig options for the camera, and a way to
see the focus.

A **Camera** panel — viewpoint presets, a
lens in millimetres on a 24 mm frame (42 is the old 32° view), elevation,
azimuth and distance sliders that follow a drag on the canvas, a horizon
tilt, a lens shift (rise and cross, as an architectural lens has, carried
in the projection's z column so verticals stay vertical), and the depth of
field and focus that were under View. The tracer's ray generation and the
contact occlusion's depth reconstruction both take the shift; roll comes
through the view matrix, so everything downstream has it for free. Camera
rays that miss now return the page colour in the tracer too, so the two
paths frame and backdrop alike. A **focus helper** (a toggle in the same
panel) is focus peaking: the composite tints green whatever the blur would
leave sharp — the piece and the table carry their distance in alpha — and
one green line marks where the plane of focus meets the table. Two earlier
tries taught what a helper has to be: a gridded card square to the line of
sight is a flat overlay from the camera and shows nothing of depth, and a
gate of contour lines standing in the scene is accurate but abstract. The
tint is on the picture itself, which is what "what is in focus" means. The
line shader now writes distance in alpha, so the depth of field treats
anchors and helper lines as things at a distance rather than smearing them.

Also in this round: the display example's ring stood stone uppermost (a
shank's crown is on +X, and pitching it +90° had sent that to −Z).

## Performance, measured

Profiled at the end of September 2026 in the in-app browser at 1400×1000.
Draft is in good shape — a frame is 5 to 14 ms from the solitaire to the
840k-triangle boutique, a keystroke rebuild 8 to 20 ms with parts memoised,
a cold compile 20 to 115 ms — so the cost was in final and traced quality
and in what followed every light change. Three things were done:

- **Final supersamples only when the view is still.** Orbiting in final
  used to draw four times the pixels of every interactive frame; now the
  scene is drawn at the canvas's size while the camera moves and at twice
  it once it settles, the way the tracer already hands off.
- **The tracer works in bands.** A sample is traced in bands of rows sized
  to about 1.5 Mpx a dispatch, each band copied back into the accumulation
  as it lands, so no frame waits on more tracing than a frame's worth and
  the panel stays responsive at the full pixel budget. Measured: five
  dispatches of 4 ms replacing one of 15 ms, with no seam.
- **The probe waits for a slider to stop.** A rebake is six views of the
  whole scene (20 to 30 ms); it now runs 150 ms after the last change,
  as the daylight sun already did, and ten ticks of a slider bake once.

Still open, in order of payoff: the occlusion bake at final quality
restarts on every keystroke (0.5 to 1.5 s); contact occlusion could be a
final-only feature; the densest examples (hydrangea, boutique) are a
million triangles from default segment counts on parts repeated hundreds
of times, and a draft-quality tessellation would cut both frame and bake.

## Open, from the first phase

- A cushion whose collar softens with the cloth rather than a fixed slope,
  and more sweep directions for its facets.
- Lettering that wraps round a closed band's seam.
- Shadow softness that grows with a light's size.
- Per-placement geometry variation is not possible while placements share a
  mesh; size varies through shrink, shape does not.
- The probe holds one bounce and stands at one point; a second probe, or a
  second bounce, would close the gap to a path tracer further.
