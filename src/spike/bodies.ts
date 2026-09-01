import { analyseConnectivity } from '../assembly/connectivity';
import { compile } from '../dsl/index';
import { examples } from '../dsl/examples';
import { forms } from '../spike/forms';

const pad = (s: string | number, n: number) => String(s).padStart(n);
console.log(
  ['sketch'.padEnd(12), pad('places', 7), pad('bodies', 7), pad('largest', 8),
   pad('floating', 9), pad('ms', 7)].join(' '),
);

const run = (name: string, assembly: ReturnType<typeof forms[string]>) => {
  const r = analyseConnectivity(assembly);
  const bad = r.bodies > 1;
  console.log(
    [name.padEnd(12), pad(assembly.placements.length, 7), pad(r.bodies, 7),
     pad(r.largest, 8), pad(r.floating, 9), pad(r.ms.toFixed(0), 7)].join(' ') +
    (bad ? '   <-' : ''),
  );
  if (!bad) return;

  // name the bodies by what is in them, so a fix has somewhere to start
  const byBody = new Map<number, Map<string, number>>();
  assembly.placements.forEach((p, i) => {
    const b = r.bodyOf[i];
    let counts = byBody.get(b);
    if (!counts) { counts = new Map(); byBody.set(b, counts); }
    counts.set(p.part.name, (counts.get(p.part.name) ?? 0) + 1);
  });
  const groups = [...byBody.values()]
    .map((counts) => [...counts].map(([k, v]) => (v > 1 ? `${v}x ${k}` : k)).join('+'))
    .reduce((acc, label) => acc.set(label, (acc.get(label) ?? 0) + 1), new Map<string, number>());
  const summary = [...groups]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => (count > 1 ? `${count} x [${label}]` : `[${label}]`))
    .join('  ');
  console.log(`             ${summary}`);
};

for (const [name, source] of Object.entries(examples)) {
  const compiled = compile(source);
  if (compiled.error) { console.log(`${name} FAILED`); continue; }
  run(name, compiled.sketch!.assembly);
}
console.log('\n--- TypeScript forms ---');
for (const [name, make] of Object.entries(forms)) run(name, make());
