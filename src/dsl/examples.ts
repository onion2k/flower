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

  brooch: `# A pearl brooch: the rosette's leaves round a pearl, a seed pearl on each stud
# Pearls are the first non-metal here. They take their names from the trade —
# white, cream, pink, grey, black, gold — and need no finish word.
material gold polished

part petal = leaf(length: 30, width: 14, thickness: 1.0, piercings: 2, boss: 2.2)
part cup   = collar(inner: 1.2, wall: 1.2, length: 1.4) in gold satin
part seed  = pearl(radius: 2.1) in white pearl
part curl  = wire(path: spiral(start: 1.0, turns: 1.2, growth: 2.6), radius: 0.9, tip: 0.15, sections: 120)
part bezel = collar(inner: 6.2, wall: 1.3, length: 2.2) in gold satin
part heart = pearl(radius: 7, oblate: 0.08) in cream pearl

unit sector {
  place petal
  fasten cup to petal.boss
  fasten seed to cup.b
  place curl at (8.5, -5, 1.2) turn -29deg
}

form brooch {
  repeat sector around ring(8, radius: 6)
  place bezel at (0, 0, 1.1)
  place heart at (0, 0, 5.3)
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
# for them to meet at and the head needs a receptacle under all of them. A flat
# plate does the job and looks like one: this is a lens, ribbed like the disc of
# a real composite, and the bases sit in its rim rather than on its face.
part cup    = pod(length: 8, width: 45, ribs: 26, ribDepth: 0.05) in bronze satin

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
# A hip is an urn, and an urn holds things: the petals gather in its mouth
# rather than being spread over a plate wider than the flower.
part hip   = bell(length: 11, mouth: 11, throat: 4, wall: 0.8, flare: 1.7, lobes: 5, lobeDepth: 0.14) in bronze satin
part stalk = stem(path: through((0,0,0), (1.5,0,-24), (-2,0,-42), (1,0,-56)), radius: 1.7, tip: 0.65, nodes: 3)
part foliage = leaf(length: 22, width: 11, thickness: 0.6, teeth: 22, veins: 3, cup: 26deg, curl: 30deg) in bronze satin
# the receptacle, sunk in the mouth of the hip where nothing sees it
part floor   = disc(radius: 5, thickness: 2.4, bevel: 0.4) in bronze satin

form rose {
  place hip at (0, 0, -11)
  place floor
  place stalk
  # every claw inside the hip's mouth, which is where a rose keeps them
  repeat heart around phyllotaxis(7, 1.05, tilt: -86deg, fade: 0.25, rise: 1.2)
  repeat mid   around phyllotaxis(10, 1.1, start: 8, tilt: -74deg, fade: 0.5, rise: 0.6)
  repeat outer around phyllotaxis(13, 0.85, start: 18, tilt: -52deg, fade: 0.9)
  repeat sepal around ring(5, radius: 3.4, z: -4, tilt: 62deg)
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
part frill = petal(length: 22, width: 15, thickness: 0.4, shape: spoon, edge: fringed, edgeCount: 30, edgeDepth: 0.11, cup: 40deg, curl: -30deg, curlBias: 2, ruffle: 1.2, ruffleWaves: 4)
part inner = petal(length: 15, width: 11, thickness: 0.4, shape: spoon, edge: fringed, edgeCount: 24, edgeDepth: 0.12, cup: 66deg, curl: -12deg, ruffle: 0.8, ruffleWaves: 4)

# The calyx is a tube, not a bud drawn to a point — that is the whole reason a
# carnation looks the way it does. Every petal is gripped in its throat, so the
# claws gather in a bundle a few millimetres across and the flower opens from
# there. Spreading them over a disc instead needs a plate to hold them, and a
# plate in the middle of a flower is exactly as bad as it sounds.
part calyx = bell(length: 17, mouth: 9, throat: 7, wall: 0.7, flare: 1.4, lobes: 5, lobeDepth: 0.22) in bronze satin

# The receptacle, sunk inside the calyx mouth where it is never seen: it catches
# every claw and is welded into the tube wall.
part floor = disc(radius: 4.5, thickness: 1.6, bevel: 0.35) in bronze satin

part stalk = stem(path: through((0,0,0), (0.4,0,-20), (-0.4,0,-40), (0.6,0,-60)), radius: 1.9, tip: 0.6, nodes: 3, swell: 0.5)
part blade = leaf(length: 34, width: 4.5, thickness: 0.5, shape: linear, cup: 46deg, keel: 0.5, curl: -58deg, curlBias: 2.4) in bronze satin

form carnation {
  place calyx at (0, 0, -17)
  place floor
  place stalk
  repeat inner around phyllotaxis(9, 1.0, tilt: -74deg, fade: 0.7, rise: 0.9)
  repeat frill around phyllotaxis(18, 0.82, start: 9, tilt: -46deg, fade: 1.2)
  repeat blade around ring(4, radius: 0.6, z: -42, tilt: -40deg)
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

  poppy: `# Papaver rhoeas — crumpled petals round a dark ring of stamens
material copper polished

# Five metals, and each is doing a job. The stamens are blackened because a
# poppy's ring of them is the darkest thing in the flower and reads as a hole;
# the anthers are gold because that ring is dotted, not solid.
part crumple = petal(length: 30, width: 30, thickness: 0.4, shape: round, edge: crenate, edgeCount: 9, edgeDepth: 0.03, cup: 38deg, curl: -14deg, curlBias: 2.2, ruffle: 1.5, ruffleWaves: 5)
part capsule = pod(length: 11, width: 9.5, ribs: 8, ribDepth: 0.09) in silver satin
part lid     = disc(radius: 5.2, thickness: 0.8, sides: 10, bevel: 0.25) in silver polished
part thread  = wire(path: through((0,0,0), (0.6,0,4), (2,0,7)), radius: 0.32, tip: 0.6, sections: 20, sides: 6) in blackened steel satin
part anther  = pod(length: 2.2, width: 0.9, segments: 10) in gold polished
part floor   = disc(radius: 5.6, thickness: 2, bevel: 0.4) in bronze satin
part stalk   = stem(path: through((0,0,0), (0.5,0,-22), (-0.6,0,-44), (0.5,0,-64)), radius: 1.7, tip: 0.55, nodes: 3) in bronze satin
part foliage = leaf(length: 26, width: 8, thickness: 0.55, shape: lanceolate, teeth: 22, toothDepth: 0.9, cup: 30deg, curl: 40deg) in bronze antiqued

unit stamen {
  place thread
  fasten anther to thread.tip
}

form poppy {
  place floor
  place stalk
  place capsule at (0, 0, 3)
  place lid at (0, 0, 7)
  # shallow, or the ring of stamens it is built around never sees daylight
  repeat crumple around ring(4, radius: 2.2, tilt: -15deg)
  repeat stamen around phyllotaxis(28, 0.95, tilt: -14deg)
  repeat foliage around ring(3, radius: 0.7, z: -40, tilt: -26deg)
}
`,

  iris: `# Iris germanica — three falls hanging, three standards arching over
material silver polished

# The one flower that needs its two whorls in different metals: standards and
# falls are the same size and the same distance out, so nothing but the tilt and
# the colour tells them apart.
part standard = petal(length: 28, width: 19, thickness: 0.5, shape: round, cup: 48deg, curl: 34deg, curlBias: 1.8)
part fall     = petal(length: 34, width: 23, thickness: 0.5, shape: lip, edge: crenate, edgeCount: 11, cup: 24deg, curl: 74deg, curlBias: 2.5) in platinum satin
part beard    = blade(path: bezier((2,0,0), (5,0,0), (9,0,-0.2), (13,0,-0.6)), width: 3.2, thickness: 1, sections: 32) in gold polished
part ovary    = pod(length: 13, width: 6, ribs: 3, ribDepth: 0.14) in brass satin
part floor    = disc(radius: 4.8, thickness: 2, bevel: 0.4) in brass satin
part stalk    = stem(path: through((0,0,-6), (0.6,0,-28), (-0.8,0,-50), (0.6,0,-72)), radius: 2, tip: 0.6, nodes: 2) in bronze satin
part sword    = leaf(length: 48, width: 12, thickness: 0.8, shape: linear, cup: 52deg, keel: 0.55, curl: -70deg, curlBias: 2.6) in bronze satin

# the beard rides the fall's midline, where the curl has barely begun to bend it
unit hanging {
  place fall
  place beard at (0, 0, 0.35)
}

form iris {
  place floor
  place ovary at (0, 0, -7)
  place stalk
  repeat standard around ring(3, radius: 3, tilt: -74deg)
  repeat hanging around ring(3, radius: 3.4, phase: 60deg, tilt: 48deg)
  repeat sword around ring(2, radius: 0.7, z: -54, tilt: -64deg)
}
`,

  fuchsia: `# Fuchsia — the one flower here that hangs
material rose gold satin

let arch = through((0,0,26), (10,0,23), (17,0,15), (21,0,7))

part branch  = stem(path: arch, radius: 1.6, tip: 0.8, nodes: 2) in bronze satin
part tube    = bell(length: 11, mouth: 8, throat: 2.2, wall: 0.5, flare: 1.5, lobes: 4, lobeDepth: 0.1)
part sepal   = petal(length: 17, width: 7, thickness: 0.45, shape: pointed, cup: 34deg, curl: -46deg, curlBias: 2.2)
part skirt   = petal(length: 11, width: 9, thickness: 0.45, shape: round, cup: 62deg, curl: -14deg) in copper polished
part thread  = wire(path: through((0,0,0), (0.8,0,6), (2.2,0,11)), radius: 0.3, tip: 0.5, sections: 22, sides: 6) in gold polished
part anther  = pod(length: 1.8, width: 0.9, segments: 10) in blackened steel satin
part floor   = disc(radius: 3.9, thickness: 1.4, bevel: 0.3) in bronze satin
part foliage = leaf(length: 20, width: 10, thickness: 0.55, teeth: 18, veins: 3, cup: 24deg, curl: 32deg) in bronze satin

unit stamen {
  place thread
  fasten anther to thread.tip
}

# Built the right way up and then turned over. Assembling it upside down means
# every tilt and curl in it has to be reasoned about inverted, and the sepals,
# the corolla and the stamens all have to agree — so they are built agreeing.
unit head {
  place tube
  place floor at (0, 0, 10.2)
  repeat sepal around ring(4, radius: 3.7, z: 10.4, tilt: 52deg)
  repeat skirt around ring(4, radius: 2.6, z: 10.6, phase: 45deg, tilt: -12deg)
  repeat stamen around ring(6, radius: 1.6, z: 10.6, tilt: -6deg)
}

form fuchsia {
  place branch
  place head at (21, 0, 8) pitch 180deg
  repeat foliage around along(arch, 3, from: 0.12, to: 0.72, taper: 0.7, alternate: yes, tilt: -30deg)
}
`,

  allium: `# Allium — a globe of florets, every one on its own spoke
material silver polished

# shell() with no radius is an umbel: every frame starts at the same point and
# faces a different way. That is exactly how an allium is put together, and it
# means the whole head hangs off one hub rather than needing anything to hold it.
part floret  = bell(length: 5, mouth: 6, throat: 1, wall: 0.35, flare: 2.8, lobes: 6, lobeDepth: 0.34, rows: 16, segments: 30)
part pedicel = wire(path: through((0,0,0), (11,0,0.6), (21,0,0)), radius: 0.55, tip: 1, sections: 24, sides: 6) in brass satin
part hub     = pod(length: 6, width: 6, segments: 20) in brass satin
part stalk   = stem(path: through((0,0,-2), (1,0,-30), (-1.5,0,-60), (1,0,-88)), radius: 2.2, tip: 0.5, nodes: 2) in bronze satin
part spathe  = leaf(length: 16, width: 7, thickness: 0.5, shape: lanceolate, cup: 40deg, curl: 40deg) in bronze antiqued

unit ray {
  place pedicel
  place floret at (21, 0, 0) pitch 90deg
}

form allium {
  place hub
  place stalk
  repeat ray around shell(52, 0, orient: outward)
  repeat spathe around ring(3, radius: 1.4, z: -7, tilt: 54deg)
}
`,

  bouquet: `# A bunch, tied — made of flowers defined elsewhere
material brass satin

# "use" brings in another sketch as one form, under its own name. Only the form
# it finally builds comes across: not its parts, not its units, not its working.
# A rose keeps its rose gold, because a flower that changed metal on being picked
# up would not be much of a reusable flower.
use rose, daisy, poppy

part binding = collar(inner: 11, wall: 1.6, length: 12)

# spray leans +Z outward, and these are whole plants standing on their stems, so
# leaning the flower out swings its stem in — which is what gathers the bunch.
form bouquet {
  place binding at (0, 0, -44)
  repeat rose  around spray(3, 16, lean: 11deg, rise: 11, spin: 1.1)
  repeat daisy around spray(5, 34, lean: 25deg, rise: 3, spin: 0.7)
  repeat poppy around spray(4, 52, lean: 37deg, rise: -8, spin: 2.4)
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
