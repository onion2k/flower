/**
 * Sketches, written in the language rather than in TypeScript.
 *
 * `rosette` is deliberately the same piece as the hand-built one in forms.ts, so
 * the two front ends can be compared placement for placement.
 */
export const examples: Record<string, string> = {
  rosette: `# A rosette: eight pierced leaves, studded, with a curl between each
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
`,

  thistle: `# Nested courses, each turned against the one below it
material silver satin

let stem = 26

part outer = leaf(length: stem, width: 11, thickness: 0.9, piercings: 2, boss: 2)
part inner = leaf(length: 17, width: 7, thickness: 0.8, piercings: 1)
part pin   = rivet(head: 3, height: 1, shank: 1.8, grip: 0.9) in gold polished
part band  = wire(path: circle(radius: 30), radius: 1, closed: yes, sections: 144)
# the inner course had nothing holding it: a second hoop gathers it, and the
# leaves are long enough now to reach the outer band and close the loop
part hoop  = wire(path: circle(radius: 14), radius: 0.9, closed: yes, sections: 120)
part drop  = bead(radius: 2, point: 2.6) in gold polished

unit spoke {
  place outer
  fasten pin to outer.boss
}

form thistle {
  place band
  place hoop
  repeat spoke around ring(14, radius: 30)
  repeat inner around ring(14, radius: 14, phase: 13deg)
  repeat drop around ring(7, radius: 13.5)
}
`,

  bloom: `# Phyllotaxis, with the tilt fading outward so the centre stands up
material copper hammered

part petal  = blade(path: bezier((0,0,0), (11,0,5), (23,0,11), (31,0,7)), width: 11, thickness: 0.9, twist: 0.12turns)
part stamen = wire(path: bezier((0,0,0), (5,0,6), (7,0,12), (4,0,16)), radius: 0.65, tip: 0.45, sections: 64)
part tip    = bead(radius: 1.4, point: 1.6, segments: 16) in gold polished
# Phyllotaxis puts every petal's base at its own radius, so there is no centre
# for them to meet at. A real head has a receptacle under all of them; without
# one this is twenty-six petals and eighteen stamens sharing an address.
part cup    = disc(radius: 22.5, thickness: 2.2, bevel: 0.6) in bronze satin

unit filament {
  place stamen
  fasten tip to stamen.tip
}

form bloom {
  place cup
  repeat petal around phyllotaxis(26, 3.9, start: 6, tilt: 1.15, fade: 2)
  repeat filament around phyllotaxis(18, 1.5, tilt: 0.5)
}
`,

  seedhead: `# A sphere, built from scales lying along the surface
material bronze antiqued

part scale = leaf(length: 12, width: 9, thickness: 0.7, piercings: 1, boss: 1.6, curl: -46deg)
part stud  = rivet(head: 2.4, height: 0.8, shank: 1.4, grip: 0.7, segments: 16) in gold polished
part rib   = wire(path: through((0,0,0), (4,0.6,0.5), (8,0.2,0.7), (11.5,-0.8,0.4)), radius: 0.42, tip: 0.25, sections: 40, sides: 8)

unit scute {
  place scale
  fasten stud to scale.boss
  place rib at (0, 0, 0.35)
}

form seedhead {
  repeat scute around shell(78, 15, orient: flat, lean: 0.12)
}
`,

  // ---- constructivist ----

  frame: `# Constructivist: a hexagonal frame whose every joint is a lap and a pin
material blackened steel brushed

# hole-to-hole spans, so the members meet exactly at the vertices
let R    = 26
let mid  = 22.52          # circumradius * cos(30deg): midpoint of each side
let arm  = (R + 6.4) / 2  # spoke runs from the hub bolt circle out to the vertex

part rim    = bar(length: R + 5, width: 5, thickness: 1.4, bore: 2.2)
part spoke  = bar(length: R - 6.4 + 4.5, width: 4.5, thickness: 1.4, bore: 2.2)
part corner = gusset(radius: 6.5, thickness: 1.4, bore: 2.2, lighten: 3.6) in brass satin
part pin    = rivet(head: 4, height: 1.3, shank: 2.1, grip: 3.2) in brass polished
part hub    = disc(radius: 9, thickness: 1.6, sides: 6, bore: 5, bolts: 6, boltCircle: 6.4) in brass satin

# Each course sits a plate higher than the one below, so the members lap rather
# than intersect — which is how the joint carries load, and how it reads.
unit rib {
  place spoke at (arm, 0, 0)
  place corner as knuckle at (R, 0, 1.4)
  fasten pin to knuckle.a
  place rim at (19.5, 11.26, 2.8) turn 120deg
}

form frame {
  place hub
  repeat rib around radial(6)
}
`,

  tower: `# Constructivist: three posts, ringed and braced. Nothing decorative.
material platinum brushed

let R = 12
let H = 36
let side = 24.8            # R * sqrt(3): the span between two posts

part post  = wire(path: through((0,0,0 - H/2), (0,0,0), (0,0,H/2)), radius: 1.5, section: square, tip: 1, sections: 20, sides: 4)
part rung  = bar(length: side + 4, width: 4, thickness: 1.2, bore: 2) in blackened steel satin
part brace = bar(length: side + 6, width: 3, thickness: 1, bore: 1.7) in brass satin
part cap   = disc(radius: 13, thickness: 1.4, sides: 6, bore: 2.2) in gold polished

# A rung spans two posts, so it is placed tangentially at the mid-radius rather
# than radially — which is the one thing a ring symmetry will not do for you.
unit course { place rung turn 90deg }
unit diagonal { place brace turn 90deg pitch 27deg }

form tower {
  repeat post around ring(3, radius: R)
  repeat course around compose(helical(3, 0, H, 0), ring(3, radius: 6, phase: 60deg))
  repeat diagonal around compose(helical(2, 0, H/2, 0), ring(3, radius: 6, phase: 60deg))
  place cap at (0, 0, H/2)
  place cap at (0, 0, 0 - H/2)
}
`,

  // ---- botanical and orrery ----

  armillary: `# Nested bands on tilted axes, with a pod at the centre
material brass satin

part outer = band(radius: 34, width: 3.2, thickness: 0.8)
part mid   = band(radius: 26, width: 2.6, thickness: 0.7) in copper satin
part inner = band(radius: 19, width: 2.2, thickness: 0.7) in gold polished
part seed  = pod(length: 15, width: 9, whorls: 7, whorlDepth: 0.5) in gold polished
part spoke = wire(path: through((0,0,0), (7,0,1), (14,0,0)), radius: 0.6, tip: 0.5, sections: 32)
part weight = bead(radius: 1.6, point: 2)
# Nested rings of different radii in different planes never meet, so each one
# needs an arm out to it from the central body — which is what an armillary has.
part armA  = wire(path: through((0,0,0), (17,0,0.6), (34,0,0)), radius: 0.85, tip: 0.7, sections: 44)
part armB  = wire(path: through((0,0,0), (13,0,0.5), (26,0,0)), radius: 0.8, tip: 0.7, sections: 40) in copper satin
part armC  = wire(path: through((0,0,0), (9.5,0,0.4), (19,0,0)), radius: 0.75, tip: 0.7, sections: 36) in gold polished

unit ray {
  place spoke
  fasten weight to spoke.tip
}

form armillary {
  place seed pitch 90deg
  place outer
  place armA
  place mid roll 34deg
  place armB roll 34deg
  place inner roll -52deg pitch 22deg
  place armC roll -52deg pitch 22deg
  repeat ray around ring(8, radius: 3, tilt: 12deg)
}
`,

  seedcase: `# Grown rather than built: pods on a golden-angle spiral
material bronze antiqued

part husk   = pod(length: 13, width: 6, whorls: 5, whorlDepth: 0.35)
part sepal  = blade(path: bezier((0,0,0), (6,0,2), (12,0,5), (16,0,3)), width: 5.5, thickness: 0.7, sections: 48)
part stem   = wire(path: through((0,0,0), (4,0,-1), (9,0,-3)), radius: 0.7, tip: 0.6, sections: 28)
part crown  = bead(radius: 2.4, point: 3.2) in gold polished

unit floret {
  place husk pitch 90deg
  place sepal at (0, 0, -2.5) turn 40deg
}

form seedcase {
  repeat floret around phyllotaxis(32, 3.6, tilt: 1.1, fade: 1.6)
  repeat stem around ring(9, radius: 16, tilt: -35deg)
  place crown at (0, 0, 4)
}
`,


  // ---- real plants ----

  narcissus: `# Narcissus pseudonarcissus — six tepals and a trumpet corona
material gold satin

part tepal  = blade(path: bezier((0,0,0), (9,0,3), (19,0,6), (26,0,2)), width: 11, thickness: 0.7, sections: 64)
part corona = bell(length: 11, mouth: 15, throat: 6, wall: 0.6, flare: 2.8) in copper satin
part stamen = wire(path: through((0,0,0), (0,0,5), (1,0,9)), radius: 0.4, tip: 0.7, sections: 20, sides: 8)
part anther = pod(length: 2.6, width: 1.1, segments: 12) in bronze satin
part stalk  = wire(path: through((0,0,0), (0,0,-14), (2,0,-27)), radius: 1.1, tip: 0.8, sections: 32)
# the receptacle: what the tepals, the corona and the stalk are all actually
# joined to. Without it they are six petals and a trumpet hanging in company.
part cup    = disc(radius: 6, thickness: 2.4, bevel: 0.5) in copper satin

unit filament {
  place stamen
  fasten anther to stamen.tip
}

form narcissus {
  # the perianth spreads out around the corona and a little forward of it,
  # which is a negative tilt — positive would sweep the tepals down and back
  place cup at (0, 0, 0.7)
  repeat tepal around ring(6, radius: 3.5, tilt: -0.32)
  place corona at (0, 0, 1.5)
  repeat filament around ring(6, radius: 2.2, z: 3, tilt: 0.25)
  place stalk
}
`,

  fern: `# A pinnate frond: leaflets up a curving rachis, shrinking toward the tip
material bronze antiqued

let arch = bezier((0,0,0), (16,0,9), (34,0,14), (48,0,8))

part rachis  = wire(path: arch, radius: 1.1, tip: 0.22, sections: 96)
part pinna   = leaf(length: 11, width: 4.4, thickness: 0.55, shape: lanceolate, veins: 3, teeth: 14, droop: 0.1)
part crozier = wire(path: spiral(start: 0.7, turns: 1.1, growth: 2.6), radius: 0.55, tip: 0.2, sections: 64)

form fern {
  place rachis
  # alternate puts successive leaflets on opposite sides, as a real frond does
  repeat pinna around along(arch, 22, from: 0.06, to: 0.94, taper: 0.28, alternate: yes, tilt: -22deg)
  place crozier at (48, 0, 8) turn 40deg
}
`,

  acer: `# Acer palmatum — one palmate leaf, pierced along its veins
material copper satin

part blade = leaf(length: 34, width: 34, thickness: 0.8, lobes: 5, spread: 2.7, veins: 4, teeth: 46, toothDepth: 0.5, boss: 2)
part stalk = wire(path: through((0,0,0), (-9,0,-1), (-19,0,-4)), radius: 0.9, tip: 0.5, sections: 28)
part pin   = rivet(head: 3.2, height: 1, shank: 1.8, grip: 0.9) in gold polished

form acer {
  place blade as leaf
  fasten pin to leaf.boss
  place stalk
}
`,

  digitalis: `# Digitalis purpurea — a spike of bells, largest at the bottom
material bronze antiqued

let spike = bezier((0,0,0), (1,0,16), (5,0,32), (11,0,44))

part stalk   = wire(path: spike, radius: 1.7, tip: 0.3, sections: 96)
part flower  = bell(length: 9, mouth: 8, throat: 3.4, wall: 0.5, flare: 1.9) in copper satin
part foliage = leaf(length: 21, width: 8.5, thickness: 0.6, veins: 4, teeth: 26, droop: 0.12)
part bud     = pod(length: 4, width: 3, segments: 16) in copper satin

# A bell is built along its own axis, so it needs turning a quarter turn to point
# out of the stem. After that the arrangement's tilt swings it down the spike.
unit corolla { place flower pitch 90deg }
unit tip { place bud pitch 90deg }

form digitalis {
  place stalk
  # Spaced by the width of a flower, not by how many will fit: eleven bells with
  # an eight-millimetre mouth over thirty millimetres of spike is a solid column.
  # Alternating them puts them on both sides, as a real raceme does.
  repeat corolla around along(spike, 7, from: 0.14, to: 0.84, taper: 0.5, alternate: yes, tilt: -34deg)
  repeat tip around along(spike, 4, from: 0.88, to: 1, taper: 0.45, alternate: yes, tilt: -18deg)
  repeat foliage around ring(5, radius: 1.2, z: 1.5, tilt: 6deg)
}
`,


  // ---- flowers ----

  rose: `# Rosa — a spiral of cupped petals, each course flatter than the last
material rose gold satin

# Three petal sizes, not one scaled: a rose opens outward, so the outer petals
# are not just bigger, they are cupped less and thrown back further.
#
# Two signs to keep straight. A negative tilt stands a petal up (positive tilts it
# down, which is how a bract droops). Standing it up turns its face normal back
# toward the axis, so from there a positive curl wraps the tip inward over the
# centre and a negative one reflexes it away. A rose does both: the heart folds
# in, the outermost course falls open.
part heart = petal(length: 13, width: 13, thickness: 0.45, shape: round, cup: 88deg, curl: 34deg, curlBias: 1.8)
part mid   = petal(length: 19, width: 19, thickness: 0.5, shape: round, cup: 66deg, curl: 14deg, curlBias: 2.2)
part outer = petal(length: 26, width: 26, thickness: 0.5, shape: round, cup: 38deg, curl: -34deg, curlBias: 2.8)
part sepal = leaf(length: 17, width: 3.6, thickness: 0.5, shape: lanceolate, teeth: 12, cup: 40deg, curl: 62deg) in bronze satin
part hip   = bud(length: 10, width: 9.5, lobes: 5, lobeDepth: 0.07, point: 0.34, swell: 1.3) in bronze satin
part stalk = stem(path: through((0,0,-9), (1.5,0,-26), (-2,0,-42), (1,0,-56)), radius: 1.7, tip: 0.65, nodes: 3)
part foliage = leaf(length: 22, width: 11, thickness: 0.6, teeth: 22, veins: 3, cup: 26deg, curl: 30deg) in bronze satin
# the receptacle every petal is actually attached to
part cup     = disc(radius: 14, thickness: 2.6, bevel: 0.6) in bronze satin

form rose {
  place cup at (0, 0, -0.5)
  repeat heart around phyllotaxis(7, 1.1, tilt: -86deg, fade: 0.25, rise: 1.7)
  repeat mid   around phyllotaxis(10, 1.9, start: 8, tilt: -74deg, fade: 0.5, rise: 0.9)
  repeat outer around phyllotaxis(13, 2.5, start: 18, tilt: -52deg, fade: 0.9)
  repeat sepal around ring(5, radius: 3.4, z: -4, tilt: 62deg)
  place hip at (0, 0, -10)
  place stalk
  repeat foliage around ring(3, radius: 0.8, z: -34, tilt: -18deg)
}
`,

  tulip: `# Tulipa — six petals in two whorls, deeply cupped and keeled
material silver satin

# The keel is the whole tulip: each petal folds along its midline rather than
# curving smoothly, which is what gives the flower its six flat facets.
part outerTepal = petal(length: 32, width: 20, thickness: 0.7, shape: round, cup: 62deg, keel: 0.45, curl: -14deg, curlBias: 2.2)
part innerTepal = petal(length: 29, width: 17, thickness: 0.7, shape: round, cup: 74deg, keel: 0.55, curl: -8deg, curlBias: 2.2)
part pistil = pod(length: 9, width: 4.5, ribs: 3, ribDepth: 0.18, segments: 24) in gold polished
part stamen = wire(path: through((0,0,0), (0.4,0,5), (1.6,0,9.5)), radius: 0.5, tip: 0.5, sections: 20, sides: 8) in gold polished
part anther = pod(length: 3.4, width: 1.2, segments: 12) in blackened steel satin

# Nearly straight, and deliberately so. A stem that wanders is prettier on its
# own, but the leaves are placed on rings about the axis, so every millimetre the
# stem strays is a millimetre of daylight between a leaf and the plant.
part stalk  = stem(path: through((0.5,0,4), (0,0,-20), (0.4,0,-42), (-0.5,0,-64)), radius: 2.2, tip: 0.6, sections: 96)

# Broadly lanceolate, not parallel-sided: a tulip leaf is widest low down and
# runs out to a long point, which is what stops it reading as a strap. The
# channel is shallow and the arch is spread along the whole leaf — cup it hard
# and bias the curl at the tip and it stops being a leaf and becomes a ladle.
part blade  = leaf(length: 37, width: 16, thickness: 0.8, shape: lanceolate, cup: 40deg, keel: 0.4, curl: -46deg, curlBias: 1.5, droop: 0.05)

unit filament {
  place stamen
  fasten anther to stamen.tip
}

form tulip {
  repeat outerTepal around ring(3, radius: 2.6, tilt: -76deg)
  repeat innerTepal around ring(3, radius: 2.2, phase: 60deg, tilt: -82deg)
  place pistil at (0, 0, 5) pitch 90deg
  repeat filament around ring(6, radius: 2, z: 1, tilt: -12deg)
  place stalk

  # Three leaves up the stem, not two across it. A pair on one ring is a
  # propeller; alternating them and shrinking each one is what a tulip does, and
  # it is also what stops the leaves reading as a second, competing symmetry.
  repeat blade around ring(1, radius: 0.8, z: -50, phase: 20deg, tilt: -66deg)
  repeat blade around ring(1, radius: 0.8, z: -34, phase: 155deg, tilt: -58deg, scale: 0.76)
  repeat blade around ring(1, radius: 0.7, z: -20, phase: 285deg, tilt: -50deg, scale: 0.54)
}
`,

  orchid: `# Phalaenopsis — bilateral, not radial: three sepals, two petals, one lip
material platinum polished

# Placed one at a time on purpose. An orchid is the one flower here that a
# symmetry cannot express, because it is symmetric about a plane and nothing else.
part sepal = petal(length: 26, width: 13, thickness: 0.5, shape: pointed, cup: 22deg, curl: -18deg)
part wing  = petal(length: 30, width: 26, thickness: 0.5, shape: round, cup: 18deg, curl: -14deg, curlBias: 2)
part lip   = petal(length: 20, width: 19, thickness: 0.6, shape: lip, edge: crenate, edgeCount: 9, cup: 54deg, curl: -46deg, curlBias: 2.4, twist: 6deg) in gold satin
part column = bud(length: 7, width: 4.4, lobes: 3, lobeDepth: 0.09, point: 0.4) in gold polished
part arch  = stem(path: through((0,0,0.6), (-8,0,-14), (-10,0,-30), (-4,0,-44)), radius: 1.6, tip: 0.5, nodes: 2)
part sheath = leaf(length: 15, width: 5, thickness: 0.5, shape: lanceolate, cup: 40deg, curl: 50deg)

form orchid {
  place sepal turn 90deg
  place sepal turn 210deg
  place sepal turn 330deg
  place wing turn 30deg
  place wing turn 150deg
  place lip at (0, 0, 0.8) turn 270deg
  place column at (0, 0, 1.6) pitch -70deg
  place arch
  place sheath at (-9, 0, -27) turn 200deg
}
`,

  carnation: `# Dianthus caryophyllus — the flower is all margin
material copper polished

# A pink is told from anything else by its cut edge, so the fringe and the frill
# are doing the work here and the silhouette barely matters.
part frill = petal(length: 21, width: 15, thickness: 0.4, shape: spoon, edge: fringed, edgeCount: 30, edgeDepth: 0.11, cup: 40deg, curl: -26deg, curlBias: 2, ruffle: 1.2, ruffleWaves: 4)
part inner = petal(length: 15, width: 11, thickness: 0.4, shape: spoon, edge: fringed, edgeCount: 24, edgeDepth: 0.12, cup: 62deg, curl: -14deg, ruffle: 0.8, ruffleWaves: 4)
part calyx = bud(length: 16, width: 10, lobes: 5, lobeDepth: 0.06, point: 0.16, swell: 1.5) in bronze satin
part stalk = stem(path: through((0,0,-16), (1,0,-32), (-2,0,-50), (1,0,-66)), radius: 1.9, tip: 0.6, nodes: 3, swell: 0.5)
part blade = leaf(length: 34, width: 4.5, thickness: 0.5, shape: linear, cup: 46deg, keel: 0.5, curl: -58deg, curlBias: 2.4) in bronze satin
# the calyx is drawn to a point, so it holds nothing: the petals need a floor
part cup   = disc(radius: 17, thickness: 2.4, bevel: 0.6) in bronze satin

form carnation {
  place cup
  repeat inner around phyllotaxis(8, 2.1, tilt: -72deg, fade: 0.8, rise: 1)
  repeat frill around phyllotaxis(16, 3.3, start: 9, tilt: -44deg, fade: 1.3)
  place calyx at (0, 0, -16)
  place stalk
  repeat blade around ring(4, radius: 0.8, z: -44, tilt: -40deg)
}
`,

  freesia: `# Freesia — florets all facing one way up an arching spike
material gold satin

let spike = bezier((0,0,0), (18,0,16), (42,0,24), (66,0,19))

# A freesia's spike is one-sided, which is exactly what "along" without
# "alternate" gives: every floret takes its frame from the same side of the curve.
part rachis = stem(path: spike, radius: 1.7, tip: 0.28, nodes: 0, sections: 96)
part tube   = bell(length: 12, mouth: 10, throat: 3, wall: 0.5, flare: 2.6, lobes: 6, lobeDepth: 0.2)
part tepal  = petal(length: 14, width: 8, thickness: 0.45, shape: strap, cup: 34deg, curl: -34deg, curlBias: 2.2)
part knot   = bud(length: 8, width: 3.8, lobes: 3, lobeDepth: 0.1, point: 0.4) in bronze satin
part sheath = leaf(length: 24, width: 4, thickness: 0.5, shape: lanceolate, cup: 34deg, curl: -44deg) in bronze satin

# The tepals belong to the tube, so they have to turn with it. Building the
# corolla upright and then laying the whole unit over is the only way round —
# pitching the tube alone leaves its tepals behind, still facing the sky.
unit corolla {
  place tube
  repeat tepal around ring(6, radius: 4.6, z: 11.4, tilt: -38deg)
}
unit floret { place corolla pitch 90deg }
unit tip { place knot pitch 90deg }

form freesia {
  place rachis
  repeat floret around along(spike, 5, from: 0.22, to: 0.76, taper: 0.7, tilt: -26deg)
  repeat tip around along(spike, 3, from: 0.85, to: 1, taper: 0.5, tilt: -12deg)
  repeat sheath around along(spike, 3, from: 0.02, to: 0.16, taper: 0.7, alternate: yes, tilt: -20deg)
}
`,

  daisy: `# Leucanthemum — a composite: ray florets round a disc of tubular ones
material silver polished

# Two arrangements, not one. The rays are a ring because they are a single whorl;
# the disc is phyllotaxis because it is hundreds of separate flowers packed.
part ray   = petal(length: 26, width: 6.5, thickness: 0.4, shape: strap, edge: notched, cup: 26deg, curl: 16deg, curlBias: 1.6)
part disc  = disc(radius: 8, thickness: 1.2, bevel: 0.4) in gold satin
part floret = bead(radius: 0.85, point: 1, segments: 10) in gold polished
part stalk = stem(path: through((0,0,0.2), (0.6,0,-18), (-0.6,0,-36), (1,0,-52)), radius: 1.6, tip: 0.6, nodes: 3)
part blade = leaf(length: 24, width: 7, thickness: 0.55, shape: spatulate, teeth: 16, cup: 24deg, curl: 34deg) in bronze satin

form daisy {
  repeat ray around ring(21, radius: 7.4, z: 0.4, tilt: -14deg)
  place disc
  repeat floret around phyllotaxis(54, 1.02, rise: 0.6, taper: 0.75)
  place stalk
  repeat blade around ring(3, radius: 0.5, z: -30, tilt: -22deg)
}
`,

  bouquet: `# A set of flowers, then a bunch made from them
material gold satin

# Every flower below is an ordinary form. What makes this a bouquet is the last
# line: a form can be repeated exactly like a part, so once a rose is defined it
# is a single thing to arrange, however many pieces it is made of.
part petalA = petal(length: 17, width: 16, thickness: 0.5, shape: round, cup: 52deg, curl: -26deg, curlBias: 2.6)
part petalB = petal(length: 11, width: 11, thickness: 0.5, shape: round, cup: 84deg, curl: 30deg, curlBias: 1.8)
part stemA  = stem(path: through((0,0,-6), (2,0,-30), (-2,0,-56), (1,0,-78)), radius: 1.7, tip: 0.6, nodes: 3)
part hipA   = bud(length: 9, width: 11, lobes: 5, lobeDepth: 0.07, point: 0.34, swell: 1.4) in bronze satin

part rayB   = petal(length: 20, width: 5.5, thickness: 0.4, shape: strap, edge: notched, cup: 24deg, curl: 14deg)
part discB  = disc(radius: 6, thickness: 1.1, bevel: 0.35) in copper satin
part stemB  = stem(path: through((0,0,-1), (-2,0,-28), (2,0,-54), (-1,0,-74)), radius: 1.4, tip: 0.6, nodes: 2)

part budC   = bud(length: 13, width: 7, lobes: 5, lobeDepth: 0.12, point: 0.3) in rose gold satin
part stemC  = stem(path: through((0,0,0), (1,0,-24), (-2,0,-50), (2,0,-70)), radius: 1.3, tip: 0.6, nodes: 2)
part leafC  = leaf(length: 26, width: 8, thickness: 0.55, shape: lanceolate, teeth: 18, cup: 30deg, curl: 40deg) in bronze satin

form aRose {
  repeat petalB around phyllotaxis(7, 1.2, tilt: -82deg, fade: 0.4, rise: 1.4)
  repeat petalA around phyllotaxis(11, 1.9, start: 8, tilt: -56deg, fade: 0.9)
  place hipA at (0, 0, -7)
  place stemA
}

form aDaisy {
  repeat rayB around ring(16, radius: 5.6, z: 0.4, tilt: -12deg)
  place discB
  place stemB
}

form aSpray {
  place budC
  place stemC
  repeat leafC around along(through((0,0,0), (1,0,-24), (-2,0,-50)), 4, from: 0.25, to: 0.9, taper: 0.6, alternate: yes, tilt: -24deg)
}

# spray leans +Z outward rather than +X, because these are whole flowers and a
# flower stands up — the one place the growth-along-X convention does not apply
form bouquet {
  repeat aRose  around spray(3, 17, lean: 20deg, rise: 9, spin: 1.1)
  repeat aDaisy around spray(5, 36, lean: 38deg, rise: 1, spin: 0.7)
  repeat aSpray around spray(7, 54, lean: 56deg, rise: -10, spin: 2.4)
}
`,

  teasel: `# Dipsacus — a spined head over a whorl of upswept bracts
material blackened steel sandblasted

part head  = pod(length: 26, width: 15, whorls: 11, whorlDepth: 0.7)
part spine = wire(path: through((0,0,0), (3,0,0.6), (6,0,0.2)), radius: 0.42, tip: 0.1, sections: 16, sides: 6) in silver polished
part bract = leaf(length: 26, width: 3.6, thickness: 0.5, shape: lanceolate, teeth: 18, droop: 0.22)
part stalk = wire(path: through((0,0,0), (0,0,-16), (1,0,-32)), radius: 1.5, tip: 0.7, sections: 32)

form teasel {
  place head
  repeat spine around shell(96, 7.2, orient: outward)
  # upswept, so the tilt is negative: a positive one points a part down the way
  repeat bract around ring(9, radius: 4, z: -11, tilt: -58deg)
  place stalk at (0, 0, -12)
}
`,

};

export const exampleNames = Object.keys(examples);
