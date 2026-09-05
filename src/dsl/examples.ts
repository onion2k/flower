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

  cloisonne: `# An enamelled brooch: emerald leaves and ruby petals round a pearl
# Enamel is an option on leaves and petals, where it fills the top face inside
# the bevel and leaves the rim as metal; on beads and eggs, which are dipped
# whole; on a bell, whose inside is glazed and whose rim stays metal; and on a
# blade, which takes it on its concave face, or its upper face if it lies flat. Transparent colours — cobalt, peacock,
# emerald, ruby, amber — glow with the metal beneath them; turquoise, moss,
# coral, lilac, ivory, white and black are opaque. veinMetal sets wires of a
# second metal along the veins, cloisonné fashion.
material gold polished

part leaf   = leaf(length: 32, width: 15, thickness: 1.1, boss: 2.2, cup: 20deg, enamel: ruby, veinMetal: silver)
part petal  = petal(length: 22, width: 13, thickness: 0.8, shape: round, cup: 55deg, curl: 30deg, enamel: emerald)
part stud   = rivet(head: 3.4, height: 1.2, shank: 2.2, grip: 1.1)
part bezel  = collar(inner: 5.6, wall: 1.3, length: 2.2) in gold satin
part heart  = pearl(radius: 6.4, oblate: 0.08) in white pearl

unit sector {
  place leaf
  fasten stud to leaf.boss
}

form cloisonne {
  repeat sector around ring(8, radius: 6)
  repeat petal around ring(6, radius: 6.5, tilt: 40deg, z: 1.2, phase: 22deg)
  place bezel at (0, 0, 1.4)
  place heart at (0, 0, 3.6)
}
`,

  faberge: `# An Easter egg in the Fabergé manner: translucent enamel fired over a
# gold body, a trellis laid over it on the diagonal with a stone at every
# crossing, a pinecone finial, and three curling legs to hold it off the table.
#
# Cobalt is a transparent enamel, so what shines through it is the gold
# underneath — which is the whole trick of the thing, and why the egg is gold
# and not silver.
material gold polished

part shell = egg(radius: 15, height: 19, taper: 0.34, enamel: cobalt, segments: 96)

# The trellis. One strand climbs the shell at forty-five degrees to the
# meridian; the dihedral group gives eight of them and eight mirror images
# running the other way, so the lattice closes on itself in diamonds.
part strand = wire(path: through((6.23, 0.00, -17.36), (7.72, 2.91, -15.86), (7.93, 6.03, -13.93), (6.97, 8.90, -11.62), (5.03, 11.17, -9.00), (2.38, 12.56, -6.14), (-0.68, 12.90, -3.11), (-3.75, 12.10, 0), (-6.43, 10.24, 3.11), (-8.32, 7.53, 6.14), (-9.15, 4.33, 9.00), (-8.76, 1.12, 11.62), (-7.24, -1.59, 13.93), (-4.89, -3.32, 15.86), (-2.19, -3.74, 17.36)), radius: 0.2, tip: 1, sections: 200, sides: 8)

# A stone at every crossing. Each course sits half a step round from the one
# below, because that is where two opposite-handed helices meet.
part spark = gem(cut: brilliant, width: 1.5) in diamond

# The finial: a collar gathering the strands, then a pinecone of small scales.
part crown = collar(inner: 3.9, wall: 0.45, length: 1.3) in gold satin
part pip   = egg(radius: 1.7, height: 3.0, taper: 0.5, segments: 28)
part scale = petal(length: 2.0, width: 2.3, thickness: 0.28, shape: round, cup: 42deg, curl: 26deg, segments: 28)
part nib   = bead(radius: 0.5, point: 0.6, segments: 16)

# The stand: three legs off a foot ring, with leaves sweeping up round the egg.
part leg   = wire(path: through((11, 0, -34), (9, 0, -28.5), (5.6, 0, -24), (8.2, 0, -20), (7.4, 0, -16.4)), radius: 0.9, tip: 0.6, sections: 110)
part sole  = wire(path: circle(radius: 11, z: -34), radius: 0.85, closed: yes, sections: 144)
part frond = leaf(length: 10.5, width: 5.6, thickness: 0.6, cup: 28deg, curl: 34deg, veins: 2)
part sprig = leaf(length: 8.5, width: 4.4, thickness: 0.5, cup: 26deg, curl: 30deg)
part curlicue = wire(path: spiral(start: 0.9, turns: 1.15, growth: 2.7), radius: 0.55, tip: 0.12, sections: 110)

form faberge {
  place shell
  repeat strand around dihedral(8)

  repeat spark around ring(8, radius: 6.46, z: -17.36, tilt: 149deg)
  repeat spark around ring(8, radius: 8.67, z: -15.68, tilt: 136deg, phase: 22.5deg)
  repeat spark around ring(8, radius: 10.93, z: -12.78, tilt: 120deg, phase: 45deg)
  repeat spark around ring(8, radius: 12.57, z: -8.64, tilt: 104deg, phase: 67.5deg)
  repeat spark around ring(8, radius: 13.15, z: -3.78, tilt: 90deg, phase: 90deg)
  repeat spark around ring(8, radius: 12.73, z: 1.13, tilt: 80deg, phase: 112.5deg)
  repeat spark around ring(8, radius: 11.62, z: 5.61, tilt: 72deg, phase: 135deg)
  repeat spark around ring(8, radius: 10.15, z: 9.45, tilt: 66deg, phase: 157.5deg)
  repeat spark around ring(8, radius: 8.54, z: 12.54, tilt: 59deg, phase: 180deg)
  repeat spark around ring(8, radius: 6.93, z: 14.90, tilt: 52deg, phase: 202.5deg)
  repeat spark around ring(8, radius: 5.44, z: 16.58, tilt: 44deg, phase: 225deg)

  place crown at (0, 0, 17.5)
  place pip at (0, 0, 20.4)
  repeat scale around ring(8, radius: 1.35, z: 19.3, tilt: 66deg)
  repeat scale around ring(8, radius: 1.45, z: 20.0, tilt: 58deg, phase: 22.5deg)
  repeat scale around ring(7, radius: 1.4, z: 20.7, tilt: 48deg)
  repeat scale around ring(6, radius: 1.2, z: 21.3, tilt: 38deg, phase: 30deg)
  repeat scale around ring(5, radius: 0.95, z: 21.8, tilt: 28deg)
  repeat scale around ring(4, radius: 0.7, z: 22.2, tilt: 18deg, phase: 45deg)
  place nib at (0, 0, 22.6)

  place sole
  repeat leg around ring(3)
  repeat frond around ring(6, radius: 6.4, z: -26, tilt: -48deg)
  repeat sprig around ring(6, radius: 8.8, z: -30.5, tilt: -30deg, phase: 30deg)
  repeat curlicue around ring(3, radius: 8.4, z: -26, tilt: 90deg, phase: 60deg)
}
`,

  cluster: `# A cluster: a brilliant held in claws, ringed by bezel-set stones
# A stone takes its species as a material — diamond, ruby, sapphire, emerald,
# amethyst, aquamarine, topaz, garnet, peridot, citrine, onyx, moonstone —
# and a cut: brilliant, oval, pear, marquise, trillion, step, baguette, rose
# or cabochon. A setting is the metal that holds one; fasten the stone to its
# seat and the girdle comes to rest on it.
material gold polished

part leaf  = leaf(length: 24, width: 11, thickness: 1.0, boss: 2.0, cup: 18deg)
part stud  = rivet(head: 2.8, height: 1.0, shank: 1.8, grip: 1.0)
part mount = setting(width: 8, style: claw, claws: 6, height: 3.4)
part stone = gem(cut: brilliant, width: 8) in diamond
part collet = setting(width: 3.4, style: bezel, height: 1.4)
part accentStone = gem(cut: brilliant, width: 3.4) in sapphire

unit spoke {
  place leaf
  fasten stud to leaf.boss
}

unit accent {
  place collet
  fasten accentStone to collet.seat
}

form cluster {
  repeat spoke around ring(8, radius: 5)
  repeat accent around ring(8, radius: 10.5, phase: 22deg, z: 1.4)
  place mount at (0, 0, 1.6)
  fasten stone to mount.seat
}
`,

  ring: `# A solitaire. "size" on a shank is the inner diameter — the finger it has
# to fit round, which is the one measurement a ring actually answers for —
# and everything else is built outward from it. The shoulder swells toward
# the crown, the seam a closed sweep starts and ends on, so that is where
# fasten lands the setting.
material gold polished

part band  = shank(size: 17, width: 2.6, thickness: 1.8, shoulder: 0.55)
part mount = setting(width: 7, style: claw, claws: 6, height: 3.2)
part stone = gem(cut: brilliant, width: 7) in diamond

form ring {
  place band
  fasten mount to band.crown
  fasten stone to mount.seat
}
`,

  tension: `# A tension setting: the stone is gripped directly by the band's own
# spring, no claw or bezel between. shank's gap cuts the band at the crown
# instead of closing it, and the same shoulder swell that thickens a plain
# ring toward the crown now falls on the two cut jaws either side of the
# gap, which is where a tension setting wants the extra metal anyway — that
# is where the grip actually happens. Widening the gap toward the stone's
# own width is what reads as gripped rather than merely adjacent; too narrow
# a gap and the stone sits on top of the band rather than caught in it.
material gold polished

part band  = shank(size: 17, width: 3.4, thickness: 2.4, gap: 0.62, shoulder: 0.3, shoulderSpread: 0.3)
part stone = gem(cut: brilliant, width: 6.5) in diamond

form tension {
  place band
  fasten stone to band.crown
}
`,

  necklace: `# A pendant on a chain. mirror() reflects across a fixed plane — the one
# containing the front-to-back and up-down axes — so a strand drawn once,
# offset to one side, comes back with its mirror image on the other: two
# hand-drawn wires for the price of one, and they meet exactly because they
# are reflections of the same curve rather than two curves eyeballed to match.
material gold polished

part strand = wire(path: through((-22, 0, 58), (-8, 38, 52), (16, 52, 32), (28, 30, 14), (26, 10, 15)), radius: 0.55, sections: 80)
part hook   = clasp(radius: 0.6, hookRadius: 4)
part bail   = collar(inner: 2.4, wall: 1, length: 2.6) in gold satin
part stone  = gem(cut: pear, width: 11, length: 15) in aquamarine
part mount  = setting(width: 11, style: bezel, height: 5)

unit side {
  place strand
}

form necklace {
  repeat side around mirror()
  place hook at (-22, 0, 58) pitch 90deg turn 90deg
  place bail at (26, 0, 15) pitch 90deg turn 90deg
  place mount at (25, 0, 9) pitch 90deg
  fasten stone to mount.seat
}
`,

  earrings: `# A pair of pearl drops. The hook is drawn the same way the trellis strand
# and the tendrils elsewhere are — a handful of points and through() — because
# a fishhook curve is not a shape any of the parametric parts already draws,
# and one drawn by hand is exactly what "wire" is for. mirror() then does for
# a pair of earrings what it did for the necklace's two strands: draw the
# right one, and the left is its reflection, not a second hand-fitted curve.
material gold polished

part hook = wire(path: through((0, 30, 42), (2.5, 30, 40), (5, 30, 34), (4, 30, 27), (1.5, 30, 22)), radius: 0.45, tip: 0.7, sections: 60)
part cap  = collar(inner: 1, wall: 0.8, length: 1) in gold satin
part drop = pearl(radius: 2.6) in white pearl

unit ear {
  place hook
  fasten cap to hook.tip
  fasten drop to cap.b
}

form earrings {
  repeat ear around mirror()
}
`,

  studs: `# A pair of stud earrings. rivet was built for exactly this, though every
# other use of it in these examples is decorative: seat and tail are a
# front and a back, a place for a visible stone or pearl to hide the head,
# and a place for a friction nut to grip from behind — a stud earring is a
# post through the lobe with something at each end, which is what the part
# already models, not a new one.
material gold polished

part post = rivet(head: 1.6, height: 0.8, shank: 0.9, grip: 9, tail: 0.6)
part drop = pearl(radius: 3.2) in white pearl
part back = bead(radius: 1.8, bore: 1)

unit ear {
  place post at (0, 30, 0) pitch 90deg
  # flip: a pearl's own seat anchor points outward, away from its body, the
  # opposite sense from a rivet's or a gem's — fastened "same" it would sit
  # behind the head rather than in front of it, hiding the shank instead
  fasten drop to post.seat flip
  fasten back to post.tail
}

form studs {
  repeat ear around mirror()
}
`,

  display: `# A jeweller's window: a solitaire on its stand, a pendant on its bust.
# Display fixtures are never metal — a plain plastic, in matte or flock,
# reads as inexpensive and dead beside whatever it is showing off, which is
# the whole point of a prop rather than a piece. ringStand's peg and bust's
# neck are landmarks like any other anchor, so a piece fastens to them, or
# simply sits near them, the same as it would to a setting or a mount.
material gold polished

part rest  = ringStand(baseRadius: 9) in grey plastic matte
part band  = shank(size: 17, width: 2.6, thickness: 1.8, shoulder: 0.55)
part mount = setting(width: 7, style: claw, claws: 6, height: 3.2)
part stone = gem(cut: brilliant, width: 7) in diamond

part figure = bust(height: 44) in white plastic flock
part drop   = pearl(radius: 2.8) in white pearl

part card = easel(width: 24, height: 30) in grey plastic matte
part loop = jumpRing(radius: 1.4, wireRadius: 0.3)
part chip = pearl(radius: 2.2) in white pearl

form display {
  place rest
  place band at (0, 0, 22) pitch 90deg
  fasten mount to band.crown
  fasten stone to mount.seat

  place figure at (32, 0, 0)
  fasten drop to figure.neck

  # easel is built flat and stood up with roll, not pitch — its own height
  # runs up local Y, the axis roll turns into world Z
  place card at (-30, 0, 0) roll 90deg
  place loop at (-30, -3, 25.8) roll 90deg
  fasten chip to loop.gate flip
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

  deco: `# Art deco: a sunburst brooch. plate() cuts a flat member to any outline —
# fan, chevron, sunburst, ziggurat, keystone, scallop, lozenge, polygon,
# roundel, stadium or card — and stacks face to back the way a disc does.
# The motifs are drawn once; the symmetries do the repeating. "engraved rays"
# cuts sunray lines into a plate, radiating from its outline's origin.
# tiers: n stacks a plate as a ziggurat, each tier shrunk by "shrink".
material gold satin

part burst = plate(sunburst(radius: 22, rays: 16, inner: 0.7, tip: 0.25), thickness: 1.2) engraved rays(scale: 0.9, depth: 0.04)
part field = plate(roundel(radius: 15), thickness: 1, enamel: black) in platinum polished
part wing  = plate(fan(radius: 11, spread: 150deg, blades: 7, inner: 3.4), thickness: 1) in platinum polished engraved rays(scale: 0.6, depth: 0.04)
part rib   = plate(chevron(width: 6, rise: 2.2, bar: 1.2), thickness: 0.8)
part drop  = plate(ziggurat(width: 12, height: 9, steps: 4, top: 4), thickness: 0.6, tiers: 2, shrink: 0.18, enamel: black) in platinum polished
part mount = setting(width: 6, style: bezel, height: 1.8) in platinum polished
part stone = gem(cut: step, width: 6) in onyx

# a fan opens along +X from its apex; turned a quarter it opens upward, and
# radial(2) hangs its twin opening downward
unit half {
  place wing at (0, 2, 2.1) turn 90deg
  place rib at (0, 12.6, 3.1) turn 90deg
}

form brooch {
  place burst
  place field at (0, 0, 1.1)
  repeat half around radial(2)
  place mount at (0, 0, 2.1)
  fasten stone to mount.seat
  place drop at (0, -20.5, 1.1) turn 180deg
}
`,

  trefoil: `# A pendant drawn by mathematics. The paths here are exact figures —
# knot(p, q) winds round a torus, lissajous(a, b) is what a harmonograph
# draws, superellipse(n) is the deco frame shape — and a wire follows any of
# them; closed: yes joins the ends. rhodonea (the rose curve) and sine are
# paths too. along() spaces parts down a path by arc length.
material gold polished

part frame = wire(path: superellipse(rx: 26, ry: 20, n: 2.5), radius: 1.3, closed: yes, sections: 200)
part knot  = wire(path: knot(radius: 11, tube: 4.5, p: 2, q: 3), radius: 1.4, closed: yes, sections: 320)
part trace = wire(path: lissajous(width: 21, height: 15, a: 3, b: 2), radius: 0.45, closed: yes, sections: 400) in platinum polished
part seed  = pearl(radius: 1) in white pearl
part bail  = jumpRing(radius: 2.4, wireRadius: 0.7)

unit dot {
  place seed at (0, 0, -3.5)
}

form pendant {
  place frame
  place trace at (0, 0, -3.5)
  repeat dot around along(lissajous(width: 21, height: 15, a: 3, b: 2), 36, from: 0, to: 0.972)
  place knot
  place bail at (0, 22.2, 0) pitch 90deg
}
`,

  engraved: `# Engraving. Write "engraved <pattern>(scale, depth, angle)" after a part
# and the pattern is cut into its surface per pixel — a groove keeps its
# width however coarse the mesh under it. scale is the pitch in mm, depth
# the cut (negative raises it, as chasing does), angle a turn in the surface.
# Patterns: hatch, crosshatch, guilloche, basketweave, rays, wave, stipple.
material silver polished

part turned  = plate(card(width: 26, height: 18, corner: 2), thickness: 1.2) engraved guilloche(scale: 0.7, depth: 0.05)
part woven   = plate(roundel(radius: 10), thickness: 1.2) in gold satin engraved basketweave(scale: 0.6, depth: 0.05)
part sunray  = plate(fan(radius: 13, spread: 120deg, blades: 5), thickness: 1.2) in gold polished engraved rays(scale: 0.8, depth: 0.05)
part lined   = plate(lozenge(length: 22, width: 12), thickness: 1.2) engraved crosshatch(scale: 0.5, depth: 0.04)
part rippled = wire(path: circle(radius: 9), radius: 2.2, closed: yes, sections: 96) in rose gold satin engraved wave(scale: 0.6, depth: 0.05)
part dotted  = bead(radius: 5, point: 4) engraved stipple(scale: 0.7, depth: 0.06)
part ruled   = collar(inner: 3, wall: 1.4, length: 9) in gold polished engraved hatch(scale: 0.4, depth: 0.04, angle: 90deg)

form sampler {
  place turned at (-18, 12, 0)
  place woven at (16, 14, 0)
  place sunray at (-6, -8, 0) turn -90deg
  place lined at (18, -10, 0)
  place rippled at (-22, -12, 0)
  place dotted at (2, 10, 4)
  place ruled at (22, 0, 0) pitch 90deg
}
`,

  inscribed: `# Lettering. engraved text("...") cuts a line of type into a part's face,
# and runes("...") spells it in Elder Futhark from the Latin. size is the em
# height in mm; at: (x, y) shifts the line from the middle of the face, in the
# face's own millimetres. A part can carry a pattern under its lettering.
material gold satin

part card   = plate(card(width: 30, height: 20, corner: 2), thickness: 1.4) engraved guilloche(scale: 0.7, depth: 0.03) engraved text("1928", size: 8, depth: 0.12)
part signet = disc(radius: 9, thickness: 2) in silver polished engraved runes("odin", size: 4.5, depth: 0.15)
part tag    = plate(lozenge(length: 26, width: 14), thickness: 1.2) in platinum polished engraved text("永遠", size: 6, depth: 0.1)
# a band's coordinates run along the ring and round its section; 2.8 across
# is the middle of its outer face, and the line sits halfway round the ring
part band   = band(radius: 12, width: 4.5, thickness: 1) in rose gold polished engraved text("AMOR VINCIT OMNIA", size: 2.6, depth: 0.08, font: sans, at: (0, 2.8, 0))

form sampler {
  place card at (-22, 4, 0)
  place signet at (12, 14, 0)
  place tag at (18, -2, 0)
  place band at (-4, -14, 0) turn 90deg
}
`,

  neon: `# Light. A part in a neon or diode material is a light source: it glows,
# blooms, and lights what is near it, the table included, though it casts no
# shadow yet. Neons: red, pink, amber, green, cyan, blue, violet, white.
# Diodes are the same idea, far brighter over far less surface. "glow n"
# after the material sets how bright: 1 is as bright as the sky, 0 is off.
# The glow slider in the panel scales them all.
material blackened steel brushed

# a black enamel face: bare metal has no diffuse and would only mirror the
# tubes as streaks, where a glassy dark face takes their glow
part back = plate(sunburst(radius: 26, rays: 12, inner: 0.72, tip: 0.3), thickness: 1.5, enamel: black) engraved rays(scale: 1.2, depth: 0.04)
part tube = wire(path: lissajous(width: 14, height: 9, a: 3, b: 2), radius: 1.1, closed: yes, sections: 300) in pink neon glow 3
part halo = wire(path: circle(radius: 20), radius: 0.9, closed: yes, sections: 160) in cyan neon glow 1.6
part lamp = bead(radius: 1.2, point: 0.5) in amber diode glow 10

unit pip {
  place lamp
}

form sign {
  place back
  place halo at (0, 0, 2.2)
  place tube at (0, 0, 3)
  repeat pip around ring(12, radius: 23.5, z: 2)
}
`,

  solids: `# Mathematical solids: a sheet shaped by a function and thickened into a
# shell. saddle, ripple, helicoid, mobius and seashell take their own
# measures; patch takes sixteen points, a four by four net row by row.
# Each has a face anchor at the middle of its top and a back opposite,
# and takes thickness, enamel and engraving like a plate.
material gold satin

part seat  = saddle(width: 22, depth: 16, rise: 5, thickness: 1) engraved guilloche(0.7, 0.04)
part sea   = ripple(width: 20, depth: 20, amplitude: 1.6, waves: 2, thickness: 0.8, enamel: cobalt) in platinum polished
part screw = helicoid(radius: 6, height: 24, turns: 1.5, thickness: 0.9) in rose gold polished
part band  = mobius(radius: 10, width: 4, thickness: 0.8) in silver polished engraved text("ONE SIDE ONE EDGE", size: 2, depth: 0.08)
part nautilus = seashell(radius: 9, tube: 4, turns: 3, growth: 2.2, thickness: 0.6) in white pearl
part hood  = patch((-10, -10, 0), (-3, -10, 3), (3, -10, 3), (10, -10, 0),
                   (-10, -3, 3), (-3, -3, 8), (3, -3, 8), (10, -3, 3),
                   (-10, 3, 3), (-3, 3, 8), (3, 3, 8), (10, 3, 3),
                   (-10, 10, 0), (-3, 10, 3), (3, 10, 3), (10, 10, 0), thickness: 1) in copper polished

form sampler {
  place seat at (-30, 16, 0)
  place sea at (0, 18, 0)
  place screw at (30, 16, 0)
  place band at (-30, -14, 0)
  place nautilus at (0, -14, 0) pitch 90deg
  place hood at (30, -14, 0)
}
`,

  coral: `# Grown by rule. tree() puts a twig at the tip of every twig: count of
# them, tilted away by spread, rolled round the parent, shrunk by shrink,
# depth levels deep. tips: yes keeps only the last level — one level more
# than the twigs puts buds at their ends. rnd(a, b) gives each fork its own
# lean and reach, drawn the same way every compile so the buds still find
# the twigs; a small twist lets the fan breathe out of its plane. See bonsai
# for a full tree.
material rose gold satin

part twig = wire(path: bow((0, 0, 0), (14, 0, 0), sag: 1.4), radius: 1, tip: 0.55, sections: 24)
# a bud at the tips is shrunk six times over, so it is authored large
part bud  = pearl(radius: 6) in white pearl

unit fan {
  repeat twig around tree(depth: 5, count: 2, length: 14, spread: rnd(26deg, 9deg), shrink: rnd(0.74, 0.07), twist: rnd(0, 12deg))
  repeat bud around tree(depth: 6, count: 2, length: 14, spread: rnd(26deg, 9deg), shrink: rnd(0.74, 0.07), twist: rnd(0, 12deg), tips: yes)
}

form coral {
  place fan pitch -90deg
}
`,

  bonsai: `# Branching in three dimensions, with play. The coral forks in twos with no
# twist and stays flat; here every tip throws three limbs, and twist rolls
# each fork round its parent so no two levels lie in one plane. rnd(a, b) is
# a number somewhere in a ± b, drawn afresh for every limb, so no two forks
# are alike — and drawn the same way every compile, so the leaves, one level
# past the limbs with the same rnd()s, land on their ends. "seed 7" at the
# top would reshuffle every draw.
material bronze satin

part limb = wire(path: bow((0, 0, 0), (16, 0, 0), sag: 1.8), radius: 1.4, tip: 0.6, sections: 24)
part leaf = leaf(length: 32, width: 15, thickness: 2.2, cup: 25deg, curl: 18deg, enamel: emerald) in gold polished

unit crown {
  repeat limb around tree(depth: 4, count: 3, length: 16, spread: rnd(36deg, 12deg), shrink: rnd(0.68, 0.08), twist: rnd(60deg, 30deg))
  repeat leaf around tree(depth: 5, count: 3, length: 16, spread: rnd(36deg, 12deg), shrink: rnd(0.68, 0.08), twist: rnd(60deg, 30deg), tips: yes)
}

form bonsai {
  place crown pitch -90deg
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

  dagger: `# A dagger: sword() at shorter proportions, not a second part — nothing
# about its shape needs its own generator, only shorter numbers for the
# blade and the grip. Displayed point-down, the way a ceremonial piece is
# actually shown, which is also the only way its own pommel jewel faces up
# rather than into the table: fasten's default alignment carries a
# cabochon's table the same way its own crown already points, so the flip
# that turns the whole dagger over turns the jewel over with it, for free.
# The grip's own leather is enamel on a helix wound round it, not a second
# metal — only the wrap carries the colour, so the rest stays whatever the
# sword itself is placed in. runeCount adds a fantasy piece's own sigils,
# struck rather than painted, so they read as metal even under enamel.
material gold polished

part blade = sword(bladeLength: 22, gripLength: 9, guardWidth: 9, bladeTaper: 0.5, enamel: umber, runeCount: 2) in silver polished
part stone = gem(cut: cabochon, width: 5) in ruby

form dagger {
  place blade at (0, 0, 33) roll 180deg
  fasten stone to blade.base
}
`,

  battleaxe: `# A ceremonial axe, pushed as far as the catalogue will go: a haft that
# is a living stem in oak, bound in leather at the hand, a jewelled steel
# head, and gold growing over all of it. Nothing here is a new part — every
# ornament is a leaf, a tendril, a bud or a stone the flowers and brooches
# already use, placed with the same symmetries. The head comes without its
# own haft (haft: no) so the stem can be wood while the steel stays steel:
# a part is one material. The stem's nodes are where its shoots come off,
# so leaves fasten there — flipped, since a leaf's base points back down
# its own length and a node points out — and the rest climb it as a vine.
# Anything laid on a cheek is drawn flat (in XY, the way ring() lays things
# out) and turned onto the face with roll: -90deg near, 90deg far. The
# finial and the poll thorn are buds fastened by their base, which points
# away from the bud the way a pearl's seat does — hence flip there too.
material platinum brushed

part haft      = stem(path: through((0, 0, 0), (0.4, -0.3, 40), (-0.6, 0.5, 80), (0.3, -0.2, 122)), radius: 2.6, tip: 0.85, nodes: 5, swell: 0.3, from: 0.44, to: 0.86, sections: 160) in oak satin
part head      = axe(haftLength: 120, haftRadius: 2.6, headReach: 40, headHeight: 46, haft: no, wrapTurns: 16, wrapFrom: 0.08, wrapLength: 0.3, enamel: umber)
part ferrule   = collar(inner: 2.3, wall: 1.2, length: 3) in gold satin
part shoot     = leaf(length: 13, width: 6, thickness: 0.5, cup: 30deg, curl: 25deg, veins: 2) in gold polished
part vineLeaf  = leaf(length: 9, width: 4.5, thickness: 0.5, cup: 25deg, curl: 15deg) in gold polished
part calyxLeaf = leaf(length: 9, width: 4, thickness: 0.5, shape: lanceolate, cup: 30deg) in gold polished
part cheekLeaf = leaf(length: 9, width: 4.5, thickness: 0.4, shape: ovate, cup: 15deg) in gold polished
part tendril   = wire(path: spiral(start: 0.8, turns: 1.3, growth: 2.2), radius: 0.45, tip: 0.15, sections: 80) in gold polished
part eye       = gem(cut: oval, width: 7, length: 10) in sapphire
part chip      = gem(cut: brilliant, width: 2.4) in ruby
part finial    = bud(length: 12, width: 6, lobes: 5) in gold satin
part thorn     = bud(length: 9, width: 4, lobes: 3) in gold satin

unit vine {
  repeat vineLeaf around helical(8, radius: 1.9, rise: 40, turns: 1.4, tilt: -50deg)
}
unit calyx {
  repeat calyxLeaf around ring(6, radius: 2.8, tilt: -72deg)
}
# the cheek: rubies round the sapphire, leaves and tendrils round those
unit cheekWork {
  repeat chip around ring(7, radius: 6.5)
  repeat cheekLeaf around ring(4, radius: 8.5, phase: 45deg)
  repeat tendril around ring(4, radius: 9.5)
}

form battleaxe {
  place haft
  place head
  place ferrule at (0, 0, 9.6)
  place ferrule at (0, 0, 45.6)
  fasten shoot to haft.n0 flip offset -0.5
  fasten shoot to haft.n1 flip offset -0.5
  fasten shoot to haft.n2 flip offset -0.5
  fasten shoot to haft.n3 flip offset -0.5
  fasten shoot to haft.n4 flip offset -0.5
  place vine at (0, 0, 76)
  place calyx at (0, 0, 108)
  fasten eye to head.cheek
  fasten eye to head.cheekBack
  place cheekWork at (22.6, 1.1, 120) roll -90deg
  place cheekWork at (22.6, -1.1, 120) roll 90deg
  fasten finial to head.top flip
  fasten thorn to head.poll flip
}
`,

  boutique: `# A shop-window spray: seven flowers of six kinds, each in its own enamel,
# gathered in a gold collar with a leather ribbon and stood in a turned
# walnut vase. The flowers are the catalogue's own — rose, tulip, daisy,
# poppy, iris and an allium at the crown — drawn again here at a smaller
# scale and glazed, since a use()d sketch keeps its own metal and these want
# colour. Each stands on a one-copy ring, tilted out from the centre so its
# stem swings in to the collar; the units are then turned round the
# vase a seventh of a circle apart, so no two heads share a sector and the
# only overlap is a petal tip brushing a neighbour's leaf.
material bronze satin

# --- allium: a globe of lilac bells on brass spokes, tallest of the bunch
part floret  = bell(length: 4, mouth: 5, throat: 0.8, wall: 0.3, flare: 2.8, lobes: 6, lobeDepth: 0.34, rows: 12, segments: 24, enamel: lilac) in silver polished
part pedicel = wire(path: through((0,0,0), (9,0,0.5), (17,0,0)), radius: 0.45, tip: 1, sections: 20, sides: 6) in brass satin
part hub     = pod(length: 5, width: 5, segments: 16) in brass satin
unit ray {
  place pedicel
  place floret at (17, 0, 0) pitch 90deg
}
part alliumStalk = stem(path: through((0,0,-2), (0.8,0,-28), (-1,0,-56), (0.6,0,-84)), radius: 1.9, tip: 0.5, nodes: 2)
unit allium {
  place hub
  place alliumStalk
  repeat ray around shell(44, 0, orient: outward)
}

# --- rose: three courses of ruby petals over a bronze hip
part heart = petal(length: 10, width: 10, thickness: 0.4, shape: round, cup: 88deg, curl: 34deg, curlBias: 1.8, enamel: ruby)
part mid   = petal(length: 15, width: 15, thickness: 0.45, shape: round, cup: 66deg, curl: 14deg, curlBias: 2.2, enamel: ruby)
part outer = petal(length: 20, width: 20, thickness: 0.45, shape: round, cup: 38deg, curl: -34deg, curlBias: 2.8, enamel: ruby)
part hip   = bell(length: 9, mouth: 9, throat: 3.5, wall: 0.7, flare: 1.7, lobes: 5, lobeDepth: 0.14)
part roseStalk = stem(path: through((0,0,-8), (1.2,0,-26), (-1.5,0,-44), (0.8,0,-62)), radius: 1.5, tip: 0.65, nodes: 3)
part roseLeaf  = leaf(length: 18, width: 9, thickness: 0.5, teeth: 20, veins: 3, cup: 26deg, curl: 30deg, enamel: moss)
unit rose {
  place hip at (0, 0, -9)
  place roseStalk
  repeat heart around phyllotaxis(7, 0.85, tilt: -86deg, fade: 0.25, rise: 1)
  repeat mid   around phyllotaxis(10, 0.9, start: 8, tilt: -74deg, fade: 0.5, rise: 0.5)
  repeat outer around phyllotaxis(13, 0.7, start: 18, tilt: -52deg, fade: 0.9)
  repeat roseLeaf around ring(2, radius: 0.7, z: -30, tilt: -18deg)
}

# --- tulip: six amber tepals, keeled
part outerTepal = petal(length: 24, width: 15, thickness: 0.6, shape: round, cup: 62deg, keel: 0.45, curl: -14deg, curlBias: 2.2, enamel: amber)
part innerTepal = petal(length: 22, width: 13, thickness: 0.6, shape: round, cup: 74deg, keel: 0.55, curl: -8deg, curlBias: 2.2, enamel: amber)
part pistil = pod(length: 7, width: 3.5, ribs: 3, ribDepth: 0.18, segments: 20) in gold polished
part tulipStalk = stem(path: through((0.4,0,3), (0,0,-20), (0.3,0,-42), (-0.4,0,-64)), radius: 1.9, tip: 0.6, sections: 80)
part tulipLeaf  = leaf(length: 30, width: 12, thickness: 0.7, shape: lanceolate, cup: 40deg, keel: 0.4, curl: -46deg, curlBias: 1.5, enamel: moss)
unit tulip {
  repeat outerTepal around ring(3, radius: 2.2, tilt: -76deg)
  repeat innerTepal around ring(3, radius: 1.8, phase: 60deg, tilt: -82deg)
  place pistil at (0, 0, 4) pitch 90deg
  place tulipStalk
  repeat tulipLeaf around ring(1, radius: 0.7, z: -44, phase: 20deg, tilt: -66deg)
  repeat tulipLeaf around ring(1, radius: 0.7, z: -30, phase: 155deg, tilt: -58deg, scale: 0.7)
}

# --- daisy: white rays round a gold disc
part ray    = petal(length: 19, width: 5, thickness: 0.35, shape: strap, edge: notched, cup: 26deg, curl: 16deg, curlBias: 1.6, enamel: white) in silver polished
part disc   = disc(radius: 6, thickness: 1, bevel: 0.35) in gold satin
part seed   = bead(radius: 0.65, point: 0.8, segments: 8) in gold polished
part daisyStalk = stem(path: through((0,0,0.2), (0.5,0,-18), (-0.5,0,-36), (0.8,0,-54)), radius: 1.4, tip: 0.6, nodes: 3)
part daisyLeaf  = leaf(length: 18, width: 6, thickness: 0.5, shape: spatulate, teeth: 14, cup: 24deg, curl: 34deg, enamel: moss)
unit daisy {
  repeat ray around ring(19, radius: 5.5, z: 0.3, tilt: -14deg)
  place disc
  repeat seed around phyllotaxis(40, 0.8, rise: 0.5, taper: 0.75)
  place daisyStalk
  repeat daisyLeaf around ring(2, radius: 0.5, z: -28, tilt: -22deg)
}

# --- poppy: four crumpled coral petals round a dark ring of stamens
part crumple = petal(length: 22, width: 22, thickness: 0.35, shape: round, edge: crenate, edgeCount: 9, edgeDepth: 0.03, cup: 38deg, curl: -14deg, curlBias: 2.2, ruffle: 1.5, ruffleWaves: 5, enamel: coral)
part capsule = pod(length: 8, width: 7, ribs: 8, ribDepth: 0.09) in silver satin
part thread  = wire(path: through((0,0,0), (0.5,0,3), (1.5,0,5.5)), radius: 0.28, tip: 0.6, sections: 16, sides: 6) in blackened steel satin
part anther  = pod(length: 1.8, width: 0.8, segments: 8) in gold polished
part poppyStalk = stem(path: through((0,0,0), (0.4,0,-20), (-0.5,0,-40), (0.4,0,-60)), radius: 1.5, tip: 0.55, nodes: 3)
part poppyLeaf  = leaf(length: 20, width: 6, thickness: 0.5, shape: lanceolate, teeth: 18, toothDepth: 0.9, cup: 30deg, curl: 40deg, enamel: moss)
unit stamen {
  place thread
  fasten anther to thread.tip
}
unit poppy {
  place poppyStalk
  place capsule at (0, 0, 2.5)
  repeat crumple around ring(4, radius: 1.8, tilt: -15deg)
  repeat stamen around phyllotaxis(24, 0.8, tilt: -14deg)
  repeat poppyLeaf around ring(2, radius: 0.6, z: -36, tilt: -26deg)
}

# --- iris: cobalt standards over peacock falls, each fall with a gold beard
part standard = petal(length: 21, width: 14, thickness: 0.45, shape: round, cup: 48deg, curl: 34deg, curlBias: 1.8, enamel: cobalt) in silver polished
part fall     = petal(length: 25, width: 17, thickness: 0.45, shape: lip, edge: crenate, edgeCount: 11, cup: 24deg, curl: 74deg, curlBias: 2.5, enamel: peacock) in silver polished
part beard    = blade(path: bezier((1.5,0,0), (4,0,0), (7,0,-0.2), (10,0,-0.5)), width: 2.4, thickness: 0.8, sections: 24) in gold polished
part ovary    = pod(length: 10, width: 4.5, ribs: 3, ribDepth: 0.14) in brass satin
part irisStalk = stem(path: through((0,0,-5), (0.5,0,-26), (-0.6,0,-48), (0.5,0,-70)), radius: 1.7, tip: 0.6, nodes: 2)
part sword     = leaf(length: 36, width: 9, thickness: 0.7, shape: linear, cup: 52deg, keel: 0.55, curl: -70deg, curlBias: 2.6, enamel: moss)
unit hanging {
  place fall
  place beard at (0, 0, 0.3)
}
unit iris {
  place ovary at (0, 0, -6)
  place irisStalk
  repeat standard around ring(3, radius: 2.4, tilt: -74deg)
  repeat hanging around ring(3, radius: 2.6, phase: 60deg, tilt: 48deg)
  repeat sword around ring(1, radius: 0.6, z: -50, tilt: -64deg)
}

# --- the gather: collar, ribbon, and a walnut vase turned from a bell
part collar = collar(inner: 7.5, wall: 1.4, length: 6, belly: 0.5) in gold satin
part ribbon = wire(path: through((7, 0, -3), (13, 4, -12), (11, 9, -24), (16, 12, -36)), radius: 1.6, section: flat, tip: 0.7, sections: 60, enamel: umber) in gold satin
part vase   = bell(length: 46, mouth: 26, throat: 12, wall: 1.6, flare: 1.5, rows: 32, segments: 48) in walnut satin

# each flower on a one-copy ring, out at its radius and tilted outward so
# its stem swings in toward the collar; the unit is then turned so the
# seven share the circle a seventh apart
unit roseOut  { repeat rose  around ring(1, radius: 40, tilt: 38deg, z: 2) }
unit tulipOut { repeat tulip around ring(1, radius: 36, tilt: 34deg, z: 12) }
unit daisyOut { repeat daisy around ring(1, radius: 44, tilt: 42deg, z: -4) }
unit poppyOut { repeat poppy around ring(1, radius: 42, tilt: 40deg, z: 0) }
unit irisOut  { repeat iris  around ring(1, radius: 38, tilt: 34deg, z: 12) }

form boutique {
  place allium at (0, 0, 28)
  place roseOut scale 0.9
  place tulipOut turn 51deg
  place daisyOut turn 103deg
  place poppyOut turn 154deg
  place irisOut turn 206deg
  place roseOut turn 257deg scale 0.85
  place daisyOut turn 309deg scale 0.9
  place collar at (0, 0, -58)
  place ribbon at (0, 0, -58)
  place ribbon at (0, 0, -58) turn 180deg
  place vase at (0, 0, -108)
}
`,

  lily: `# Lilium — six tepals thrown right back, six long stamens, one style
material silver polished

# A lily's tepals recurve so far that the flower is wider than it is deep:
# the curl is the largest of any flower here, and a shallow keel keeps each
# tepal from reading as a strap once it has bent that far. Two whorls of
# three, the inner one a shade smaller and steeper, as in the plant.
part tepal    = petal(length: 38, width: 17, thickness: 0.6, shape: pointed, cup: 30deg, keel: 0.25, curl: -80deg, curlBias: 2.4, ruffle: 0.5, ruffleWaves: 3)
part filament = wire(path: through((0,0,0), (4,0,14), (11,0,26)), radius: 0.45, tip: 0.6, sections: 30, sides: 8) in gold polished
part anther   = pod(length: 5, width: 1.4, segments: 12) in bronze satin
part style    = wire(path: through((0,0,0), (0.6,0,16), (2,0,30)), radius: 0.7, tip: 0.8, sections: 30, sides: 8) in gold polished
part stigma   = bud(length: 3, width: 3, lobes: 3, lobeDepth: 0.2, point: 0.2) in bronze satin
part floor    = disc(radius: 4, thickness: 1.8, bevel: 0.4) in bronze satin
part stalk    = stem(path: through((0,0,-1), (1,0,-24), (-1.5,0,-50), (1,0,-76)), radius: 1.8, tip: 0.6, nodes: 3) in bronze satin
part blade    = leaf(length: 26, width: 5, thickness: 0.5, shape: lanceolate, cup: 30deg, curl: -40deg, curlBias: 2) in bronze satin

unit stamen {
  place filament
  fasten anther to filament.tip
}

form lily {
  place floor
  place stalk
  repeat tepal around ring(3, radius: 2.8, tilt: -36deg)
  repeat tepal around ring(3, radius: 2.6, phase: 60deg, tilt: -46deg, scale: 0.94)
  # the filaments already rise in their own path, so the ring only spreads them
  repeat stamen around ring(6, radius: 1.8, z: 0.8)
  place style at (0, 0, 0.8)
  fasten stigma to style.tip
  # leaves in whorls up the stem, as a lily carries them
  repeat blade around ring(5, radius: 1.5, z: -40, tilt: -30deg)
  repeat blade around ring(5, radius: 1.5, z: -60, phase: 36deg, tilt: -26deg, scale: 0.9)
}
`,

  peony: `# Paeonia — a bowl of ruffled petals, course upon course
material rose gold satin

# The peony is a rose with the discipline taken out: more petals, every one
# of them crimped along its edge, and the courses not so much nested as
# heaped. Three sizes again, but the ruffle does most of the work.
part heart = petal(length: 14, width: 14, thickness: 0.4, shape: round, edge: crenate, edgeCount: 7, cup: 80deg, curl: 20deg, curlBias: 1.8, ruffle: 1.0, ruffleWaves: 4)
part mid   = petal(length: 21, width: 21, thickness: 0.45, shape: round, edge: crenate, edgeCount: 9, cup: 60deg, curl: 6deg, curlBias: 2, ruffle: 1.2, ruffleWaves: 5)
part outer = petal(length: 28, width: 28, thickness: 0.5, shape: round, edge: crenate, edgeCount: 11, cup: 40deg, curl: -20deg, curlBias: 2.6, ruffle: 1.0, ruffleWaves: 5)
part carpel = pod(length: 6, width: 3, segments: 14) in gold polished
part thread = wire(path: through((0,0,0), (0.5,0,4), (1.4,0,7)), radius: 0.3, tip: 0.6, sections: 18, sides: 6) in gold polished
part anther = pod(length: 2, width: 0.9, segments: 8) in bronze satin
part cup    = bell(length: 8, mouth: 10, throat: 4, wall: 0.8, flare: 1.6, lobes: 5, lobeDepth: 0.16) in bronze satin
part floor  = disc(radius: 4.5, thickness: 2, bevel: 0.4) in bronze satin
part stalk  = stem(path: through((0,0,0), (2,0,-22), (-2,0,-44), (1,0,-62)), radius: 1.9, tip: 0.6, nodes: 3) in bronze satin
part foliage = leaf(length: 24, width: 12, thickness: 0.6, lobes: 3, spread: 1.4, veins: 3, cup: 20deg, curl: 24deg) in bronze satin

unit stamen {
  place thread
  fasten anther to thread.tip
}

form peony {
  place cup at (0, 0, -8)
  place floor
  place stalk
  repeat carpel around ring(5, radius: 1.4, z: 1, tilt: -70deg)
  repeat stamen around phyllotaxis(30, 0.9, start: 5, tilt: -12deg)
  repeat heart around phyllotaxis(8, 1.2, start: 14, tilt: -84deg, fade: 0.3, rise: 1.2)
  repeat mid   around phyllotaxis(12, 1.1, start: 22, tilt: -70deg, fade: 0.5, rise: 0.6)
  repeat outer around phyllotaxis(14, 0.95, start: 34, tilt: -50deg, fade: 0.9)
  repeat foliage around ring(3, radius: 0.9, z: -36, tilt: -20deg)
}
`,

  lotus: `# Nelumbo — whorls of keeled petals round a seed head
material gold satin

# The receptacle is the lotus: a flat-topped cone with the seeds set into
# its face. A bell with a wide throat is that cone, mouth up, and the
# seeds are beads laid on a phyllotaxis inside the mouth.
part outer = petal(length: 30, width: 16, thickness: 0.6, shape: pointed, cup: 50deg, keel: 0.25, curl: -22deg, curlBias: 2.2)
part inner = petal(length: 24, width: 13, thickness: 0.6, shape: pointed, cup: 62deg, keel: 0.3, curl: -6deg, curlBias: 2)
part head  = bell(length: 8, mouth: 13, throat: 6, wall: 1.2, flare: 1.1, rows: 12) in bronze satin
part seed  = bead(radius: 1.2, point: 0.6, segments: 12) in gold polished
part thread = wire(path: through((0,0,0), (0.8,0,5), (2.2,0,9)), radius: 0.3, tip: 0.6, sections: 18, sides: 6) in gold polished
part anther = pod(length: 2.2, width: 0.9, segments: 8) in bronze satin
part stalk = stem(path: through((0,0,0), (1,0,-14), (-1,0,-28), (0.5,0,-40)), radius: 1.6, tip: 0.7, nodes: 2, sections: 60) in bronze satin

unit stamen {
  place thread
  fasten anther to thread.tip
}
unit seeds {
  repeat seed around phyllotaxis(13, 1.9)
}

form lotus {
  place head
  place seeds at (0, 0, 7.6)
  repeat stamen around ring(24, radius: 6.4, z: 1.5, tilt: -10deg)
  repeat outer around ring(8, radius: 5, tilt: -58deg)
  repeat inner around ring(8, radius: 4, phase: 22.5deg, z: 0.6, tilt: -70deg)
  place stalk
}
`,

  snowdrop: `# Galanthus — one nodding bell on a bent scape, over two strap leaves
material silver polished

# Built upright, then hung: the flower is a unit assembled the right way up
# and turned over at the end of its stalk, the way the fuchsia is, so its
# tilts are reasoned about the right way round. The scape bends through a
# right angle at the top, which is what makes a snowdrop nod rather than
# merely lean.
let bend = through((0,0,0), (0,0,34), (2,0,42), (8,0,42))

part scape  = stem(path: bend, radius: 1.0, tip: 0.6, nodes: 0, sections: 60) in bronze satin
part spathe = leaf(length: 9, width: 3, thickness: 0.4, shape: lanceolate, cup: 40deg, curl: 20deg) in bronze satin
part ovary  = pod(length: 4, width: 3, segments: 14) in bronze satin
part outer  = petal(length: 14, width: 7, thickness: 0.4, shape: spoon, cup: 46deg, curl: -10deg, curlBias: 2, enamel: white)
part inner  = petal(length: 8, width: 5, thickness: 0.4, shape: round, edge: notched, cup: 70deg, curl: 4deg, enamel: white)
part blade  = leaf(length: 38, width: 4.5, thickness: 0.6, shape: linear, cup: 36deg, keel: 0.4, curl: -30deg, curlBias: 2) in bronze satin

unit flower {
  place ovary pitch 90deg
  repeat outer around ring(3, radius: 1.8, z: 3.5, tilt: -64deg)
  repeat inner around ring(3, radius: 1.4, z: 3.6, phase: 60deg, tilt: -78deg)
}

form snowdrop {
  place scape
  place flower at (8, 0, 42) pitch 180deg
  place spathe at (2, 0, 42) turn 20deg
  repeat blade around ring(2, radius: 0.8, phase: 90deg, tilt: -70deg)
}
`,

  bangle: `# A bangle: a hammered hoop with a course of sapphires round its crown
material gold hammered

# A band is a hoop lying flat; the settings sit on its outer face, so the
# ring that places them is tilted a quarter turn to point their seats
# outward, at the band's outer radius. A polished wire either edge frames
# the hammered face the way a rolled rim does.
part hoop   = band(radius: 32, width: 9, thickness: 2.4)
part rim    = wire(path: circle(radius: 33.4, z: 4.2), radius: 0.7, closed: yes, sections: 180) in gold polished
part rimB   = wire(path: circle(radius: 33.4, z: -4.2), radius: 0.7, closed: yes, sections: 180) in gold polished
part collet = setting(width: 4.4, style: bezel, height: 1.8) in gold polished
part stone  = gem(cut: brilliant, width: 4.4) in sapphire

unit set {
  place collet
  fasten stone to collet.seat
}

form bangle {
  place hoop
  place rim
  place rimB
  repeat set around ring(16, radius: 33.2, tilt: 90deg)
}
`,

  tiara: `# A tiara: graduated brilliants along a double arch, pearls on the peaks
material platinum polished

# Drawn flat, as a circlet is seen from above: two rails on the same arc,
# one a little inside the other, and the stones spaced by arc length with
# the largest at the middle — "taper" shrinks them toward the ends.
let sweep = arc(radius: 40, from: 20deg, to: 160deg)
let inner = arc(radius: 36, from: 22deg, to: 158deg)

part rail   = wire(path: sweep, radius: 0.9, sections: 160)
part rail2  = wire(path: inner, radius: 0.8, sections: 160)
part collet = setting(width: 5, style: claw, claws: 4, height: 2.6)
part stone  = gem(cut: brilliant, width: 5) in diamond
part spike  = wire(path: through((0,0,0), (0,0,5), (0,0,9)), radius: 0.5, tip: 0.5, sections: 20)
part drop   = pearl(radius: 2.2) in white pearl
part brace  = wire(path: through((36,0,0), (38,0,0.8), (40,0,0)), radius: 0.6, tip: 1, sections: 12)

unit set {
  place collet
  fasten stone to collet.seat
}
unit finial {
  place spike
  fasten drop to spike.tip
}

form tiara {
  place rail
  place rail2
  repeat set around along(sweep, 9, from: 0.06, to: 0.94, taper: 0.5)
  place brace turn 50deg
  place brace turn 90deg
  place brace turn 130deg
  place finial at (0, 40, 0)
  place finial at (-24, 32, 0) scale 0.8
  place finial at (24, 32, 0) scale 0.8
}
`,

  girandole: `# Girandole earrings: a stud, a fan of a bow, and three pear drops on rings
material gold polished

# The pair hangs in the plane a mirror reflects across, one either side,
# and every piece is turned a quarter to face forward: a fan opens along
# +X, so pitched a quarter it opens downward, which is a bow; a bezel's
# seat and a jump ring's face turn the same way.
part hook   = wire(path: through((0, 14, 48), (0, 16.5, 46), (0, 19, 40), (0, 18, 34), (0, 15.5, 30)), radius: 0.45, tip: 0.7, sections: 60)
part top    = setting(width: 5, style: bezel, height: 2.2)
part topStone = gem(cut: brilliant, width: 5) in amethyst
part bow    = plate(fan(radius: 7, spread: 110deg, blades: 5, inner: 1.6), thickness: 1) engraved rays(scale: 0.5, depth: 0.03)
part link   = jumpRing(radius: 1.2, wireRadius: 0.3)
part collet = setting(width: 4, style: bezel, height: 2)
part drop   = gem(cut: pear, width: 4, length: 6.5) in amethyst

# a pendant is drawn flat along +X from its ring, so pitched a quarter it hangs
unit pendant {
  place link
  place collet at (5.2, 0, 0)
  fasten drop to collet.seat
}

unit ear {
  place hook
  place top at (0, 14, 28) pitch 90deg
  fasten topStone to top.seat
  place bow at (0, 14, 26) pitch 90deg
  place pendant at (0, 9, 20) pitch 90deg
  place pendant at (0, 14, 18.5) pitch 90deg
  place pendant at (0, 19, 20) pitch 90deg
}

form girandole {
  repeat ear around mirror()
}
`,

  signet: `# A signet ring: a bevelled face with a device cut into it, on a shank
# that swells up to meet it. The face is a plate fastened by its back to
# the shank's crown, flipped so the back is what meets the metal.
material gold satin

part band = shank(size: 18, width: 4.5, thickness: 2, shoulder: 0.9, shoulderSpread: 0.6)
part face = plate(card(width: 13, height: 11, corner: 3.5), thickness: 2.4, bevel: 0.7) in gold polished engraved runes("tyr", size: 5, depth: 0.16)

form signet {
  place band
  fasten face.back to band.crown flip
}
`,

  skyscraper: `# Art deco: a skyscraper clip. Setbacks in platinum over a black shadow,
# a row of baguettes on every terrace, a sunburst finial. Flat, as a clip
# is worn: the tower's steps are drawn by the ziggurat outline, and each
# setback carries a black sash with baguettes let into it.
material platinum polished

part shadow = plate(ziggurat(width: 24, height: 35, steps: 6, top: 8), thickness: 1, enamel: black)
part tower  = plate(ziggurat(width: 20, height: 32, steps: 6, top: 5), thickness: 2)
part sash   = plate(card(width: 12, height: 1.6, corner: 0.2), thickness: 0.6, enamel: black)
part bag    = gem(cut: baguette, width: 1.5, length: 3.6) in diamond
part collet = setting(width: 3.2, style: bezel, height: 1.4)
part cap    = gem(cut: brilliant, width: 3.2) in diamond
part burst  = plate(fan(radius: 9, spread: 180deg, blades: 9, inner: 2), thickness: 1) in gold satin engraved rays(scale: 0.5, depth: 0.04)

# a sash across a setback, with four baguettes let into it
unit terrace {
  place sash
  place bag at (-4, 0, 0.5)
  place bag at (-1.3, 0, 0.5)
  place bag at (1.3, 0, 0.5)
  place bag at (4, 0, 0.5)
}

# the tower's steps are 32/6 apart; each terrace sits just above one, sized to it
form skyscraper {
  place shadow at (0, -1.5, -1.5)
  place tower
  place terrace at (0, 6.1, 1.3)
  place terrace at (0, 11.5, 1.3) scale 0.85
  place terrace at (0, 16.8, 1.3) scale 0.7
  place terrace at (0, 22.1, 1.3) scale 0.55
  place collet at (0, 28.5, 1)
  fasten cap to collet.seat
  place burst at (0, 32, 0) turn 90deg
}
`,

  cocktail: `# Art deco cocktail ring: a step-cut onyx in a stepped platinum head,
# brilliants at the corners, black enamel between. The head is built flat
# as a unit and pitched a quarter turn onto the shank's crown, which sits
# at the band's outer radius on +X.
material platinum polished

part band   = shank(size: 17, width: 3, thickness: 2, shoulder: 0.6)
part table  = plate(card(width: 15, height: 15, corner: 2), thickness: 1.6, tiers: 2, shrink: 0.12)
part frame  = plate(card(width: 11.5, height: 11.5, corner: 1.2), thickness: 0.6, enamel: black)
part mount  = setting(width: 7, style: bezel, height: 2.2)
part stone  = gem(cut: step, width: 7) in onyx
part collet = setting(width: 2.2, style: bezel, height: 1.2)
part chip   = gem(cut: brilliant, width: 2.2) in diamond

unit corner {
  place collet
  fasten chip to collet.seat
}
unit head {
  place table
  place frame at (0, 0, 1.9)
  place mount at (0, 0, 2.2)
  fasten stone to mount.seat
  repeat corner around ring(4, radius: 5.8, phase: 45deg, z: 2.2)
}

form cocktail {
  place band
  place head at (12.1, 0, 0) pitch 90deg
}
`,

  mantel: `# Art deco: a mantel clock. A keystone case in black enamel over a
# stepped foot, a roundel dial cut with rays, a chapter ring of baguettes
# for the hours, and hands. The face is what the engraving is for: rays
# from the dial's centre, like the sunburst dials of the thirties.
material brass satin

part foot  = plate(ziggurat(width: 60, height: 8, steps: 3, top: 44), thickness: 6, tiers: 1) in blackened steel satin
part case  = plate(keystone(width: 44, height: 40, flare: 0.25, corner: 3), thickness: 8, enamel: black)
part rim   = wire(path: circle(radius: 16), radius: 1.2, closed: yes, sections: 120) in brass polished
part dial  = plate(roundel(radius: 15.5), thickness: 1) in silver satin engraved rays(scale: 0.7, depth: 0.04)
part hour  = gem(cut: baguette, width: 1.2, length: 3) in onyx
part boss  = rivet(head: 2.4, height: 0.8, shank: 1.2, grip: 0.8) in brass polished
part hand  = plate(lozenge(length: 11, width: 2), thickness: 0.5) in blackened steel polished
part minute = plate(lozenge(length: 14, width: 1.6), thickness: 0.5) in blackened steel polished
part fin   = plate(chevron(width: 10, rise: 4, bar: 1.6), thickness: 1) in brass polished

unit face {
  place dial
  place rim at (0, 0, 0.5)
  repeat hour around ring(12, radius: 12.5, z: 0.6)
  place hand at (2.8, 4.2, 0.9) turn 56deg
  place minute at (-1.8, 6.6, 1.4) turn 105deg
  place boss at (0, 0, 1)
}

# a plate is drawn flat; roll stands it up, and the quarter turn after it
# brings its face round to +X, the way the piece is looked at
form mantel {
  place foot roll 90deg turn 90deg
  place case at (0, 0, 8) roll 90deg turn 90deg
  place face at (4.2, 0, 30) roll 90deg turn 90deg
  place fin at (4.2, 0, 52) roll 90deg turn 90deg
}
`,

  sunflower: `# Helianthus — a ring of rays round a spiral of seeds
material gold satin

# The disc is the point: a phyllotaxis of seeds packed tight enough that the
# spirals show both ways, with the outermost florets standing up round its
# rim. The rays are a whorl and a half, the second slipped between the first.
# The head is built flat, facing up, as a unit; then the stalk bends over
# at the top and the head is pitched a quarter turn to face along it, the
# way a sunflower in seed hangs its face rather than holding it to the sky.
part ray    = petal(length: 30, width: 8, thickness: 0.4, shape: pointed, cup: 20deg, keel: 0.2, curl: 12deg, curlBias: 1.6, ruffle: 0.4, ruffleWaves: 2)
part disc   = disc(radius: 17, thickness: 2.4, bevel: 0.6) in bronze antiqued
part seed   = bead(radius: 0.9, point: 0.5, segments: 10) in bronze satin
part floret = bud(length: 2.6, width: 1.4, lobes: 5, point: 0.3, segments: 10) in gold polished
part bract  = leaf(length: 10, width: 4, thickness: 0.5, shape: lanceolate, cup: 30deg, curl: -20deg) in bronze satin
part stalk  = stem(path: through((0,0,-72), (1,0,-44), (-1,0,-18), (2,0,-7), (9,0,-2)), radius: 2.4, tip: 0.7, nodes: 3, swell: 0.4, sections: 120) in bronze satin
part foliage = leaf(length: 30, width: 22, thickness: 0.7, shape: cordate, teeth: 30, veins: 4, cup: 18deg, curl: 28deg) in bronze satin

unit head {
  place disc at (0, 0, -1.2)
  repeat seed around phyllotaxis(140, 1.25, rise: 0.4, taper: 0.9)
  repeat floret around ring(30, radius: 15.8, z: 0.4, tilt: -60deg)
  repeat ray around ring(17, radius: 16.5, z: -0.2, tilt: -8deg)
  repeat ray around ring(17, radius: 16.5, z: -1.6, phase: 10.6deg, tilt: 4deg, scale: 0.94)
  repeat bract around ring(14, radius: 15.5, z: -2.8, tilt: 34deg)
}

form sunflower {
  place stalk
  place head at (11.5, 0, -2) pitch 98deg
  repeat foliage around ring(2, radius: 1.2, z: -36, phase: 30deg, tilt: -24deg)
}
`,

  magnolia: `# Magnolia — nine thick tepals in three whorls, on a bare branch
material silver satin

# A magnolia opens before its leaves, so the branch is bare and the flower is
# all of it. The tepals are thick and spoon-cupped, and the innermost whorl
# stays nearly closed round the column of carpels.
part outer  = petal(length: 34, width: 20, thickness: 0.9, shape: spoon, cup: 58deg, curl: -18deg, curlBias: 2.2)
part middle = petal(length: 32, width: 18, thickness: 0.9, shape: spoon, cup: 66deg, curl: -6deg, curlBias: 2)
part inner  = petal(length: 27, width: 15, thickness: 0.9, shape: spoon, cup: 76deg, curl: 8deg, curlBias: 1.8)
part column = pod(length: 12, width: 4.5, whorls: 9, whorlDepth: 0.35) in gold satin
part cup    = bell(length: 7, mouth: 9, throat: 4, wall: 0.8, flare: 1.4, lobes: 3, lobeDepth: 0.12) in bronze antiqued
part floor  = disc(radius: 4, thickness: 2, bevel: 0.4) in bronze antiqued
part twig   = stem(path: through((0,0,-6), (-6,0,-20), (-16,0,-34), (-30,0,-44)), radius: 1.7, tip: 0.7, nodes: 3, swell: 0.4) in bronze antiqued
part side   = stem(path: through((-16,0,-34), (-14,6,-24), (-10,10,-14)), radius: 1.0, tip: 0.6, nodes: 1) in bronze antiqued
part bud    = bud(length: 11, width: 5, lobes: 3, lobeDepth: 0.1, point: 0.6) in silver satin

form magnolia {
  place cup at (0, 0, -7)
  place floor
  place column at (0, 0, 1) pitch 90deg
  repeat outer  around ring(3, radius: 3.6, tilt: -50deg)
  repeat middle around ring(3, radius: 3.2, phase: 60deg, z: 0.4, tilt: -64deg)
  repeat inner  around ring(3, radius: 2.6, z: 0.8, tilt: -78deg)
  place twig
  place side
  place bud at (-10, 10, -14) pitch -70deg turn 40deg
}
`,

  dahlia: `# Dahlia — a pompon: quilled petals by the hundred, each course tighter
material copper polished

# The quill is the whole trick: a petal rolled into a tube along its length,
# so a pompon dahlia is not petals but hundreds of small horns, packed on a
# phyllotaxis and standing more upright toward the middle.
# (the part is not called quill: a part name shadows the word, and the shape wants the word)
part horn  = petal(length: 13, width: 8, thickness: 0.4, shape: quill, cup: 70deg, curl: -10deg, curlBias: 1.8)
part heart = petal(length: 8, width: 5, thickness: 0.4, shape: quill, cup: 84deg, curl: 8deg)
part floor = disc(radius: 6, thickness: 2.4, bevel: 0.5) in bronze satin
part calyx = bell(length: 8, mouth: 13, throat: 6, wall: 0.8, flare: 1.4, lobes: 6, lobeDepth: 0.15) in bronze satin
part stalk = stem(path: through((0,0,0), (1,0,-22), (-1.5,0,-44), (0.5,0,-64)), radius: 2, tip: 0.6, nodes: 3) in bronze satin
part foliage = leaf(length: 26, width: 13, thickness: 0.6, teeth: 24, veins: 3, cup: 20deg, curl: 26deg) in bronze satin

form dahlia {
  place calyx at (0, 0, -8)
  place floor
  place stalk
  repeat heart around phyllotaxis(24, 0.95, tilt: -78deg, fade: 0.4, rise: 1.4)
  repeat horn around phyllotaxis(90, 0.95, start: 24, tilt: -62deg, fade: 1.6, taper: 0.85)
  repeat foliage around ring(2, radius: 0.9, z: -30, phase: 20deg, tilt: -20deg)
}
`,

  hydrangea: `# Hydrangea — a mophead: dozens of four-petalled florets on a dome
material silver polished

# One floret is nothing; the head is the flower. shell() lays them over a
# dome of the head's radius, each facing out, and the florets are enamelled
# so the head reads as a mass of colour rather than as metal.
part petal   = petal(length: 6, width: 5.5, thickness: 0.35, shape: round, edge: notched, cup: 16deg, curl: -8deg, enamel: cobalt)
part eye     = bead(radius: 0.7, point: 0.4, segments: 10) in gold polished
part pedicel = wire(path: through((0,0,0), (0,0,3), (0,0,6)), radius: 0.35, tip: 1, sections: 8, sides: 6) in bronze satin
part core    = pod(length: 22, width: 22, segments: 24) in bronze satin
part stalk   = stem(path: through((0,0,-6), (1,0,-24), (-1,0,-44), (0.5,0,-62)), radius: 2, tip: 0.7, nodes: 2) in bronze satin
part foliage = leaf(length: 30, width: 18, thickness: 0.7, shape: ovate, teeth: 28, veins: 4, cup: 16deg, curl: 22deg) in bronze satin

unit floret {
  place pedicel
  repeat petal around ring(4, radius: 1.0, z: 6, tilt: -12deg)
  place eye at (0, 0, 6.4)
}

form hydrangea {
  place core
  repeat floret around shell(64, 12, orient: outward, lean: 0)
  place stalk
  repeat foliage around ring(2, radius: 1.2, z: -30, phase: 45deg, tilt: -22deg)
}
`,

  bluebell: `# Hyacinthoides — a raceme of nodding bells down one side of an arching stem
material silver satin

let spike = bezier((0,0,0), (2,0,26), (10,0,44), (26,0,52))

# The bells hang from short pedicels and all face the same way, which is why
# a bluebell nods: the stem bows under them. A bell is built mouth up, so
# turned over in its own unit it hangs, and the pedicel's own droop is all
# the swing it needs — the raceme places it without a tilt of its own.
part rachis  = stem(path: spike, radius: 1.5, tip: 0.3, nodes: 0, sections: 96) in bronze satin
part bell    = bell(length: 9, mouth: 6, throat: 3.2, wall: 0.45, flare: 1.6, lobes: 6, lobeDepth: 0.3, rows: 14, enamel: cobalt)
part pedicel = wire(path: through((0,0,0), (4,0,-1.5), (7.5,0,-4.5)), radius: 0.4, tip: 0.8, sections: 12, sides: 6) in bronze satin
part knot    = bud(length: 5, width: 2.6, lobes: 6, lobeDepth: 0.1, point: 0.3) in silver satin
part blade   = leaf(length: 42, width: 5, thickness: 0.6, shape: linear, cup: 40deg, keel: 0.45, curl: -36deg, curlBias: 2) in bronze satin

unit flower {
  place pedicel
  place bell at (7.5, 0, -4.5) pitch 180deg
}
unit tip { place knot pitch 90deg }

form bluebell {
  place rachis
  repeat flower around along(spike, 8, from: 0.28, to: 0.88, taper: 0.7)
  repeat tip around along(spike, 3, from: 0.9, to: 1, taper: 0.5, tilt: -20deg)
  repeat blade around ring(4, radius: 1.2, z: 1, phase: 30deg, tilt: -66deg)
}
`,

  crocus: `# Crocus — a goblet of six tepals, three stamens and a branched style
material gold satin

# The goblet: tepals cupped hard and barely curled, so the flower closes
# round its stamens the way a crocus does on a dull day. Both whorls the
# same size, the inner turned a sixth. The grassy leaves have a pale
# midrib in life; here it is a keel.
part tepal  = petal(length: 26, width: 12, thickness: 0.6, shape: spoon, cup: 68deg, keel: 0.15, curl: 4deg, curlBias: 2, enamel: lilac)
part stamen = wire(path: through((0,0,0), (0.4,0,7), (1.2,0,13)), radius: 0.45, tip: 0.6, sections: 20, sides: 8) in gold polished
part anther = pod(length: 5, width: 1.3, segments: 12) in amber neon glow 0
part style  = wire(path: through((0,0,0), (0.6,0,8), (2.2,0,15)), radius: 0.4, tip: 0.5, sections: 20, sides: 6) in copper polished
part frill  = bud(length: 3, width: 2.2, lobes: 5, lobeDepth: 0.25, point: 0.1) in copper polished
part floor  = disc(radius: 3.6, thickness: 2, bevel: 0.4) in bronze satin
part tube   = stem(path: through((0,0,-1), (0.4,0,-14), (0,0,-26)), radius: 1.4, tip: 0.8, nodes: 0, sections: 40) in bronze satin
part blade  = leaf(length: 34, width: 3, thickness: 0.5, shape: linear, cup: 30deg, keel: 0.6, curl: -30deg, curlBias: 2) in bronze satin

unit filament {
  place stamen
  fasten anther to stamen.tip
}
unit pistil {
  place style
  fasten frill to style.tip
}

form crocus {
  place floor
  place tube
  repeat tepal around ring(3, radius: 2.6, tilt: -80deg)
  repeat tepal around ring(3, radius: 2.4, phase: 60deg, z: 0.4, tilt: -84deg)
  repeat filament around ring(3, radius: 1.4, z: 0.8, tilt: -4deg)
  repeat pistil around ring(3, radius: 0.5, z: 0.8, phase: 60deg)
  repeat blade around ring(6, radius: 1.2, z: -20, tilt: -74deg)
}
`,

  calla: `# Zantedeschia — one spathe wrapped round a spadix
material platinum polished

# The one flower here that is a single petal. The spathe is a petal cupped
# almost into a tube and twisted a little, so its lip rolls back on one
# side and stays wrapped on the other; the spadix is a pod standing in it.
part spathe = petal(length: 44, width: 44, thickness: 0.8, shape: round, cup: 64deg, curl: -52deg, curlBias: 3, twist: 22deg)
part spadix = pod(length: 22, width: 4, whorls: 12, whorlDepth: 0.12) in gold satin
part floor  = disc(radius: 3.6, thickness: 2.4, bevel: 0.5) in bronze satin
part stalk  = stem(path: through((0,0,0), (1,0,-24), (-1,0,-50), (0.5,0,-76)), radius: 2.2, tip: 0.6, nodes: 0, sections: 80) in bronze satin
part blade  = leaf(length: 40, width: 20, thickness: 0.7, shape: deltoid, veins: 4, cup: 24deg, curl: 20deg) in bronze satin

form calla {
  place floor
  place stalk
  place spadix at (0, 0, 2) pitch 90deg
  repeat spathe around ring(1, radius: 1.5, tilt: -70deg)
  repeat blade around ring(2, radius: 1.2, z: -30, phase: 60deg, tilt: -44deg)
}
`,

  cherry: `# Prunus — a spray of blossom on a bare twig, five notched petals each
material rose gold polished

# A branch drawn once and forked by tree(), the blossoms at its tips and a
# few buds among them. Each flower is a unit: five notched petals in
# white enamel, a boss of stamens, on a short pedicel, so the tree can
# place the whole thing at every twig end.
part twig   = wire(path: bow((0, 0, 0), (18, 0, 0), sag: 1.2), radius: 1.1, tip: 0.6, sections: 24) in bronze antiqued
part petal  = petal(length: 8, width: 7, thickness: 0.35, shape: round, edge: notched, edgeDepth: 0.14, cup: 30deg, curl: -10deg, enamel: white)
part thread = wire(path: through((0,0,0), (0.4,0,2.5), (1.2,0,4.5)), radius: 0.22, tip: 0.6, sections: 12, sides: 6) in gold polished
part anther = bead(radius: 0.4, segments: 8) in bronze satin
part calyx  = bud(length: 3, width: 2.4, lobes: 5, lobeDepth: 0.2, point: 0.2) in bronze antiqued
part pedicel = wire(path: through((0,0,0), (1,0,3), (3,0,6)), radius: 0.35, tip: 0.8, sections: 12, sides: 6) in bronze antiqued
part budCase = bud(length: 5, width: 3.2, lobes: 5, lobeDepth: 0.14, point: 0.5) in copper satin

unit stamen {
  place thread
  fasten anther to thread.tip
}
unit blossom {
  place pedicel
  place calyx at (3, 0, 6) pitch 90deg
  repeat petal around ring(5, radius: 1.6, z: 8, tilt: -20deg)
  repeat stamen around ring(9, radius: 0.9, z: 8.2, tilt: -18deg)
}
unit branch {
  repeat twig around tree(depth: 3, count: 2, length: 18, spread: rnd(34deg, 10deg), shrink: rnd(0.78, 0.06), twist: rnd(40deg, 30deg))
  repeat blossom around tree(depth: 4, count: 2, length: 18, spread: rnd(34deg, 10deg), shrink: rnd(0.78, 0.06), twist: rnd(40deg, 30deg), tips: yes)
  repeat budCase around tree(depth: 2, count: 2, length: 18, spread: rnd(34deg, 10deg), shrink: rnd(0.78, 0.06), twist: rnd(40deg, 30deg), tips: yes)
}

form cherry {
  place branch pitch -60deg
}
`,

  compact: `# Art deco: a powder compact. A stadium case, a field of peacock enamel
# fired over guilloché — the engraving and the enamel on the same plate,
# which is what guilloché enamel is — a black chevron across it, a sunray
# thumb-piece and a keystone catch.
material silver polished

part body   = plate(stadium(length: 52, width: 36), thickness: 3, bevel: 0.6) in silver satin
part lid    = plate(stadium(length: 52, width: 36), thickness: 2.2, bevel: 0.6) engraved hatch(scale: 0.5, depth: 0.03, angle: 90deg)
part field  = plate(stadium(length: 44, width: 28), thickness: 1, enamel: peacock) engraved guilloche(scale: 0.7, depth: 0.05)
part stripe = plate(chevron(width: 24, rise: 7, bar: 2.6), thickness: 0.5, enamel: black)
part thumb  = plate(fan(radius: 6, spread: 180deg, blades: 7, inner: 1.5), thickness: 1.6) in gold satin engraved rays(scale: 0.4, depth: 0.03)
part catch  = plate(keystone(width: 4, height: 5, flare: 0.4, corner: 0.5), thickness: 1.2) in gold satin

form compact {
  place body
  place lid at (0, 0, 2.6)
  place field at (0, 0, 4.2)
  place stripe at (0, -3, 4.9)
  place stripe at (0, 3, 4.9) turn 180deg
  # a fan opens along +X; turned a quarter back it opens toward -Y, off the rim
  place thumb at (0, -16, 3.7) turn -90deg
  place catch at (0, 15, 3.7) turn 180deg
}
`,

  lamp: `# Art deco: a table lamp. A stepped octagonal foot, a fluted column, and
# a fan of frosted glass — a white plastic plate, the nearest thing the
# catalogue has — stood up on edge with a diode behind it to light it.
material brass satin

part foot   = plate(polygon(sides: 8, radius: 22), thickness: 4, tiers: 3, shrink: 0.16) in blackened steel satin
part column = collar(inner: 3.5, wall: 3, length: 44, belly: 0.15) engraved hatch(scale: 1.6, depth: 0.2, angle: 90deg)
part ring   = collar(inner: 6.6, wall: 1.6, length: 2.4) in brass polished
part shade  = plate(fan(radius: 30, spread: 150deg, blades: 9, inner: 6, bladeDepth: 0.06), thickness: 2.2) in white plastic matte
part bulb   = bead(radius: 4, point: 3) in white diode glow 14
part finial = bead(radius: 4.5, point: 6) in brass polished

# a fan opens along +X; pitched back a quarter it opens upward, its face to -X,
# and the half turn brings the face round to +X
form lamp {
  place foot at (0, 0, 6)
  place column at (0, 0, 34)
  place ring at (0, 0, 13)
  place ring at (0, 0, 55)
  place shade at (0, 0, 58) pitch -90deg turn 180deg
  place bulb at (5, 0, 66)
  place finial at (0, 0, 92)
}
`,

  scent: `# Art deco: a scent bottle. The body is a step-cut stone — glass is a
# stone with nothing in it, and moonstone is frosted glass — stood on a black plinth, with a silver collar
# and a sunray stopper. A gem's table is +Z, so the bottle is the stone
# turned onto its side and pitched up to stand.
material silver polished

part flask   = gem(cut: step, width: 26, length: 36, depth: 0.45) in moonstone
part plinth  = plate(card(width: 36, height: 16, corner: 1.5), thickness: 3, tiers: 2, shrink: 0.12) in blackened steel satin
part neck    = collar(inner: 3.2, wall: 2.2, length: 5) in silver satin
part stopper = plate(fan(radius: 11, spread: 170deg, blades: 7, inner: 2.4), thickness: 3, bevel: 0.6) engraved rays(scale: 0.5, depth: 0.05)
part stud    = gem(cut: brilliant, width: 2.6) in diamond
part collet  = setting(width: 2.6, style: bezel, height: 1.2)

unit knop {
  place collet
  fasten stud to collet.seat
}

form scent {
  place plinth
  place flask at (0, 0, 21) pitch 90deg
  place neck at (0, 0, 41.5)
  place stopper at (0, 0, 44) pitch -90deg turn 180deg
  place knop at (0, -1.5, 47.5) pitch 90deg
  place knop at (0, 1.5, 47.5) pitch -90deg
}
`,

  cuff: `# Art deco: a cuff. A wide band cut with rays, a keystone of black enamel
# on its crown with a row of brilliants across it, and a pair of chevrons
# either side. Everything on the band is placed on a one-copy ring tilted
# a quarter turn, which is how a flat motif is put on a hoop's outer face.
material platinum polished

part hoop    = band(radius: 30, width: 22, thickness: 2.2) engraved rays(scale: 1.4, depth: 0.05)
part rim     = wire(path: circle(radius: 31.2, z: 10.6), radius: 0.8, closed: yes, sections: 180) in gold satin
part rimB    = wire(path: circle(radius: 31.2, z: -10.6), radius: 0.8, closed: yes, sections: 180) in gold satin
part shield  = plate(keystone(width: 12, height: 16, flare: 0.5, corner: 1), thickness: 1.2, enamel: black)
part wing    = plate(chevron(width: 10, rise: 4, bar: 1.8), thickness: 1) in gold satin
part collet  = setting(width: 2.4, style: bezel, height: 1.2) in gold polished
part stone   = gem(cut: brilliant, width: 2.4) in diamond

unit set {
  place collet
  fasten stone to collet.seat
}
unit crown {
  place shield at (0, -8, 0)
  place set at (0, -4, 1)
  place set at (0, 0, 1)
  place set at (0, 4, 1)
  place set at (0, 8, 1)
  place wing at (0, 12, 0)
  place wing at (0, -12, 0) turn 180deg
}

form cuff {
  place hoop
  place rim
  place rimB
  repeat crown around ring(1, radius: 31.4, tilt: 90deg)
  repeat crown around ring(1, radius: 31.4, phase: 180deg, tilt: 90deg)
}
`,

  mirror: `# Art deco: a vanity mirror. A stadium of polished silver stood on
# edge in a stepped foot, framed by a rim wire, a fan at each shoulder,
# and a chevron drop at the bottom. Polished silver is the mirror: the
# environment and the table show in it, which is what a mirror is for.
material silver polished

part glass   = plate(stadium(length: 60, width: 44), thickness: 2)
part frame   = wire(path: ellipse(rx: 23, ry: 31), radius: 1.6, closed: yes, sections: 200) in gold satin
part foot    = plate(card(width: 40, height: 14, corner: 1.5), thickness: 3, tiers: 3, shrink: 0.14) in blackened steel satin
part post    = bar(length: 12, width: 6, thickness: 3, bore: 1.5) in gold satin
part fan     = plate(fan(radius: 9, spread: 120deg, blades: 5, inner: 2), thickness: 1.6) in gold satin engraved rays(scale: 0.5, depth: 0.04)
part drop    = plate(chevron(width: 12, rise: 5, bar: 2), thickness: 1.6, enamel: black) in gold satin

# the glass and its frame are drawn flat and stood up with roll, the
# quarter turn after it facing them along +X
form mirror {
  place foot
  place post at (0, 0, 8) roll 90deg turn 90deg
  place glass at (0, 0, 46) roll 90deg turn 90deg
  place frame at (1.2, 0, 46) roll 90deg turn 90deg
  place fan at (1.4, 14, 68) roll 90deg turn 90deg
  place fan at (1.4, -14, 68) roll 90deg turn 90deg
  place drop at (1.4, 0, 12) roll 90deg turn 90deg
}
`,

};

export const exampleNames = Object.keys(examples);

/**
 * The sketches by what they are, for the subject picker. Order within a
 * group is the order they're worth meeting in; anything left out of every
 * group is still shown, under "Other", rather than lost.
 */
export const exampleGroups: Array<[string, string[]]> = [
  ['Jewellery', ['ring', 'tension', 'cluster', 'signet', 'cocktail', 'bangle', 'tiara', 'necklace', 'earrings', 'studs', 'girandole', 'brooch', 'rosette', 'cloisonne', 'faberge', 'display']],
  ['Art deco', ['deco', 'skyscraper', 'compact', 'cuff', 'mantel', 'lamp', 'scent', 'mirror', 'trefoil']],
  ['Flowers', ['rose', 'peony', 'dahlia', 'tulip', 'lily', 'lotus', 'magnolia', 'calla', 'orchid', 'carnation', 'sunflower', 'freesia', 'daisy', 'poppy', 'iris', 'crocus', 'fuchsia', 'snowdrop', 'bluebell', 'cherry', 'hydrangea', 'allium', 'narcissus', 'digitalis', 'bouquet', 'boutique']],
  ['Foliage & seed', ['fern', 'acer', 'thistle', 'bloom', 'seedhead', 'seedcase', 'teasel']],
  ['Weapons', ['dagger', 'battleaxe']],
  ['Structures', ['frame', 'tower', 'armillary']],
  ['Techniques', ['engraved', 'inscribed', 'neon', 'solids', 'coral', 'bonsai']],
];
{
  const placed = new Set(exampleGroups.flatMap(([, names]) => names));
  const other = exampleNames.filter((n) => !placed.has(n));
  if (other.length) exampleGroups.push(['Other', other]);
}
