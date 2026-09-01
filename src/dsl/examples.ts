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
part stud  = rivet(head: 3.6, height: 1.2, shank: 2.2, grip: 1.1) in rose-gold polished
part curl  = wire(path: spiral(start: 1.1, turns: 1.25, growth: 3), radius: 1, tip: 0.15, sections: 120)
part heart = bead(radius: 5.2, point: 5.5) in rose-gold satin

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
  repeat scute around shell(78, 15, orient: tangential, lean: 0.34)
}
`,
};

export const exampleNames = Object.keys(examples);
