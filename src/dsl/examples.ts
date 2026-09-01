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
part heart = bead(radius: 5.2, point: 5.5) in rose gold satin

unit sector {
  place petal
  fasten stud to petal.boss
  place curl at (9, -5.5, 1.4) turn -29deg
}

form rosette {
  repeat sector around ring(8, radius: 5.5)
  place heart at (0, 0, 1.2)
}
`,

  thistle: `# Nested courses, each turned against the one below it
material silver satin

let stem = 26

part outer = leaf(length: stem, width: 11, thickness: 0.9, piercings: 2, boss: 2)
part inner = leaf(length: stem / 2, width: 7, thickness: 0.8, piercings: 1)
part pin   = rivet(head: 3, height: 1, shank: 1.8, grip: 0.9) in gold polished
part band  = wire(path: circle(radius: 30), radius: 1, closed: yes, sections: 144)
part drop  = bead(radius: 2, point: 2.6) in gold polished

unit spoke {
  place outer
  fasten pin to outer.boss
}

form thistle {
  place band
  repeat spoke around ring(14, radius: 30)
  repeat inner around ring(14, radius: 14, phase: 13deg)
  repeat drop around ring(7, radius: 7)
}
`,

  bloom: `# Phyllotaxis, with the tilt fading outward so the centre stands up
material copper hammered

part petal  = blade(path: bezier((0,0,0), (11,0,5), (23,0,11), (31,0,7)), width: 11, thickness: 0.9, twist: 0.12turns)
part stamen = wire(path: bezier((0,0,0), (5,0,6), (7,0,12), (4,0,16)), radius: 0.65, tip: 0.45, sections: 64)
part tip    = bead(radius: 1.4, point: 1.6, segments: 16) in gold polished

unit filament {
  place stamen
  fasten tip to stamen.tip
}

form bloom {
  repeat petal around phyllotaxis(26, 3.9, start: 6, tilt: 1.15, fade: 2)
  repeat filament around phyllotaxis(18, 1.5, tilt: 0.5)
}
`,

  seedhead: `# A sphere, built from scales lying along the surface
material bronze antiqued

part scale = leaf(length: 12, width: 7.5, thickness: 0.7, piercings: 1, boss: 1.6)
part stud  = rivet(head: 2.4, height: 0.8, shank: 1.4, grip: 0.7, segments: 16) in gold polished
part rib   = wire(path: through((0,0,0), (4,0.6,0.5), (8,0.2,0.7), (11.5,-0.8,0.4)), radius: 0.42, tip: 0.25, sections: 40, sides: 8)

unit scute {
  place scale
  fasten stud to scale.boss
  place rib at (0, 0, 0.35)
}

form seedhead {
  repeat scute around shell(78, 15, orient: flat, lean: 0.34)
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
part cap   = disc(radius: 4.4, thickness: 1.4, sides: 6, bore: 2.2) in gold polished

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

unit ray {
  place spoke
  fasten weight to spoke.tip
}

form armillary {
  place outer
  place mid roll 34deg
  place inner roll -52deg pitch 22deg
  place seed pitch 90deg
  repeat ray around ring(8, radius: 8, tilt: 12deg)
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
  place sepal at (0, 0, -5) turn 40deg
}

form seedcase {
  repeat floret around phyllotaxis(32, 3.6, tilt: 1.1, fade: 1.6)
  repeat stem around ring(9, radius: 21, tilt: -35deg)
  place crown at (0, 0, 9)
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

unit filament {
  place stamen
  fasten anther to stamen.tip
}

form narcissus {
  # tepals swept back and down, as the perianth sits behind the corona
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
  repeat corolla around along(spike, 11, from: 0.16, to: 0.82, taper: 0.5, tilt: -34deg)
  repeat tip around along(spike, 5, from: 0.86, to: 1, taper: 0.45, tilt: -20deg)
  repeat foliage around ring(5, radius: 2.5, z: 1.5, tilt: 68deg)
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
  repeat bract around ring(9, radius: 4, z: -11, tilt: 62deg)
  place stalk at (0, 0, -12)
}
`,

};

export const exampleNames = Object.keys(examples);
