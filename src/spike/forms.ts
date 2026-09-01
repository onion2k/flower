import { Assembly } from '../assembly/assembly';
import { bezier3, catmullRom, logSpiral, arc } from '../geom/curve';
import { multiply, rotationAbout, translation, uniformScale, identity } from '../geom/transform';
import { phyllotaxis, ring, sphereShell, radial } from '../pattern/symmetry';
import { bead, collar, rivet } from '../parts/fastener';
import { leaf } from '../parts/leaf';
import { blade, wire } from '../parts/wire';

/**
 * Assembled forms.
 *
 * Each is a handful of parts placed by connect() and multiplied by a symmetry —
 * which is the whole thesis: a few cheap pieces, repeated, become a sculpture,
 * and the repetition is a list of matrices rather than more geometry.
 */

function rosette(): Assembly {
  const petal = leaf({ name: 'petal', length: 34, width: 15, thickness: 1.1, piercings: 3, bossBore: 2.4 });
  const stud = rivet({ headDiameter: 3.6, headHeight: 1.2, shankDiameter: 2.2, grip: 1.1 });
  stud.material = { metal: 'rose gold', finish: 'polished' };
  const curl = wire({
    name: 'curl',
    path: logSpiral(1.1, 1.25, 3.0),
    radius: 1.0,
    tipScale: 0.15,
    sections: 120,
  });
  const heart = bead({ radius: 5.2, point: 5.5 });
  heart.material = { metal: 'rose gold', finish: 'satin' };

  // one sector: a pierced leaf, a stud through its boss, and a curl beside it
  const unit = new Assembly('rosette-unit');
  const lp = unit.place(petal);
  unit.connect(lp.anchor('boss'), stud, 'seat');
  unit.place(curl, multiply(translation([9, -5.5, 1.4]), rotationAbout([0, 0, 1], (-29 * Math.PI) / 180)));

  const form = new Assembly('rosette');
  form.repeat(unit, ring(8, 5.5));
  form.place(heart, translation([0, 0, 1.2]));
  return form;
}

function flower(): Assembly {
  const petal = blade({
    name: 'petal',
    // authored growing along +X and rising, so the symmetry frames drop it in
    path: bezier3([0, 0, 0], [11, 0, 5], [23, 0, 11], [31, 0, 7]),
    width: 11,
    thickness: 0.9,
    twistTurns: 0.12,
    sections: 80,
  });
  const stamen = wire({
    name: 'stamen',
    path: bezier3([0, 0, 0], [5, 0, 6], [7, 0, 12], [4, 0, 16]),
    radius: 0.65,
    tipScale: 0.45,
    sections: 64,
  });
  const tip = bead({ radius: 1.4, point: 1.6, segments: 16 });

  const form = new Assembly('flower');

  // outer courses lie flat, inner ones stand up — the tilt is what makes it a
  // flower rather than a rosette drawn on a plate
  form.repeat(
    single(petal),
    phyllotaxis(26, 3.9, { startIndex: 6, tilt: (t) => 1.15 * (1 - t) * (1 - t), taper: 1.0 }),
  );

  const stamenUnit = new Assembly('stamen');
  const sp = stamenUnit.place(stamen);
  stamenUnit.connect(sp.anchor('tip'), tip, 'seat', { align: 'same' });
  form.repeat(stamenUnit, phyllotaxis(18, 1.5, { tilt: (t) => 0.5 * t }));

  return form;
}

function mandala(): Assembly {
  const outerLeaf = leaf({ name: 'outer-leaf', length: 26, width: 12, thickness: 1, piercings: 2, bossBore: 2.2 });
  const innerLeaf = leaf({ name: 'inner-leaf', length: 15, width: 8, thickness: 0.9, piercings: 1 });
  const curl = wire({ name: 'curl', path: logSpiral(0.9, 1.15, 3.2), radius: 0.85, tipScale: 0.16, sections: 100 });
  const band = wire({ name: 'band', path: arc(34, 0, Math.PI * 2), radius: 1.1, closed: true, sections: 144, sides: 10 });
  const inner = wire({ name: 'inner-band', path: arc(17, 0, Math.PI * 2), radius: 0.8, closed: true, sections: 112, sides: 8 });
  const knot = collar({ innerRadius: 1.15, wall: 0.55, length: 3.2, segments: 16 });
  const stud = rivet({ headDiameter: 3.2, headHeight: 1.1, shankDiameter: 2, grip: 1, segments: 20 });
  const drop = bead({ radius: 2.2, point: 2.8, segments: 20 });
  drop.material = { metal: 'gold', finish: 'polished' };
  knot.material = { metal: 'brass', finish: 'satin' };
  stud.material = { metal: 'brass', finish: 'polished' };

  const form = new Assembly('mandala');
  form.place(band);
  form.place(inner);

  // outer course: leaves reaching out past the band, each studded and collared
  const outerUnit = new Assembly('outer');
  const op = outerUnit.place(outerLeaf);
  outerUnit.connect(op.anchor('boss'), stud, 'seat');
  outerUnit.place(knot, multiply(translation([0, 0, 0]), rotationAbout([0, 1, 0], Math.PI / 2)));
  form.repeat(outerUnit, ring(16, 34));

  form.repeat(single(innerLeaf), ring(16, 17, { phase: Math.PI / 16 }));
  form.repeat(single(curl), ring(16, 20.5, { phase: Math.PI / 16, tilt: 0.35 }));
  form.repeat(single(drop), ring(12, 9));
  return form;
}

function orb(): Assembly {
  const scale = leaf({ name: 'scale', length: 12, width: 7.5, thickness: 0.7, piercings: 1, bossBore: 1.6 });
  const stud = rivet({ headDiameter: 2.4, headHeight: 0.8, shankDiameter: 1.4, grip: 0.7, segments: 16 });
  const rib = wire({
    name: 'rib',
    path: catmullRom([[0, 0, 0], [4, 0.6, 0.5], [8, 0.2, 0.7], [11.5, -0.8, 0.4]]),
    radius: 0.42,
    tipScale: 0.25,
    sections: 40,
    sides: 8,
  });

  const unit = new Assembly('scale-unit');
  const sp = unit.place(scale);
  unit.connect(sp.anchor('boss'), stud, 'seat');
  unit.place(rib, translation([0, 0, 0.35]));

  const form = new Assembly('orb');
  // each scale lies along the surface and lifts slightly, so they overlap the way
  // a seed head or a pine cone does rather than bristling outward
  form.repeat(unit, sphereShell(78, 15, { orient: 'flat', lean: 0.34 }));
  return form;
}

/** A one-part assembly, for repeating a bare part under a symmetry. */
function single(part: Parameters<Assembly['place']>[0]): Assembly {
  const a = new Assembly(part.name);
  a.place(part, identity());
  return a;
}

/** A quick demonstration that nesting symmetries costs nothing but a product. */
function coronet(): Assembly {
  const petal = leaf({ name: 'coronet-leaf', length: 18, width: 9, thickness: 0.9, piercings: 1 });
  const drop = bead({ radius: 1.8, point: 2.4, segments: 18 });
  const form = new Assembly('coronet');
  const cluster = new Assembly('cluster');
  cluster.repeat(single(petal), radial(3, -0.4));
  cluster.merge(single(drop), multiply(translation([4, 0, 2]), uniformScale(1)));
  form.repeat(cluster, ring(9, 22, { tilt: 0.55 }));
  return form;
}

export const forms: Record<string, () => Assembly> = {
  rosette,
  flower,
  mandala,
  orb,
  coronet,
};

export const formNames = Object.keys(forms);
