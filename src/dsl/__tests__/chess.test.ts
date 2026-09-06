/**
 * The chess set, checked as a chess set rather than as geometry: a board
 * whose colours a player would recognise, and thirty-two men on the squares
 * they start a game on. Everything here is a placement's position, so it
 * runs in node with no GPU.
 */
import { describe, expect, it } from 'vitest';
import { compile } from '../index';
import { examples } from '../examples';

const FILES = 'abcdefgh';
/** The board is centred on the origin with squares 22 apart, so a position names a square. */
function square(x: number, y: number): string {
  return FILES[Math.round((x + 77) / 22)] + (Math.round((y + 77) / 22) + 1);
}
function build(name: string) {
  const r = compile(examples[name], { resolve: (n) => examples[n] });
  expect(r.error, r.error && `line ${r.error.line}: ${r.error.message}`).toBeUndefined();
  return r.sketch!.assembly;
}

describe('the chessboard', () => {
  const colours = new Map<string, string>();
  for (const p of build('chessboard').placements) {
    if (p.part.name === 'light' || p.part.name === 'dark') colours.set(square(p.matrix[12], p.matrix[13]), p.part.name);
  }

  it('has sixty-four squares, one to a name', () => {
    expect(colours.size).toBe(64);
  });

  it('is coloured as a board is: a1 dark, and every neighbour the other colour', () => {
    expect(colours.get('a1')).toBe('dark');
    expect(colours.get('h1')).toBe('light');
    expect(colours.get('a8')).toBe('light');
    expect(colours.get('h8')).toBe('dark');
    for (let f = 0; f < 8; f++) for (let r = 1; r <= 8; r++) {
      const here = colours.get(FILES[f] + r);
      if (f < 7) expect(colours.get(FILES[f + 1] + r), `${FILES[f]}${r} and its neighbour`).not.toBe(here);
      if (r < 8) expect(colours.get(FILES[f] + (r + 1)), `${FILES[f]}${r} and the square above`).not.toBe(here);
    }
  });

  it('leaves gold between the squares: they are smaller than the pitch they sit on', () => {
    const light = build('chessboard').placements.find((p) => p.part.name === 'light')!;
    const width = light.part.bounds.max[0] - light.part.bounds.min[0];
    expect(width).toBeLessThan(22);
    expect(width).toBeGreaterThan(20);
  });
});

describe('the set, laid out for the first move', () => {
  const men = new Map<string, string>();
  for (const p of build('chess').placements) {
    const m = /^(silver|gold)(Pawn|Rook|Knight|Bishop|Queen|King)[A-Z]/.exec(p.part.name);
    if (m) men.set(square(p.matrix[12], p.matrix[13]), `${m[1]} ${m[2].toLowerCase()}`);
  }

  it('stands thirty-two men on thirty-two squares', () => {
    expect(men.size).toBe(32);
  });

  it('gives each army its back rank and its pawns', () => {
    const back = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    for (let f = 0; f < 8; f++) {
      expect(men.get(FILES[f] + 1), FILES[f] + 1).toBe(`silver ${back[f]}`);
      expect(men.get(FILES[f] + 8), FILES[f] + 8).toBe(`gold ${back[f]}`);
      expect(men.get(FILES[f] + 2), FILES[f] + 2).toBe('silver pawn');
      expect(men.get(FILES[f] + 7), FILES[f] + 7).toBe('gold pawn');
    }
  });

  it('puts the queens on the d file, facing each other, the white one on her own colour', () => {
    expect(men.get('d1')).toBe('silver queen');
    expect(men.get('d8')).toBe('gold queen');
    const colours = new Map<string, string>();
    for (const p of build('chessboard').placements) {
      if (p.part.name === 'light' || p.part.name === 'dark') colours.set(square(p.matrix[12], p.matrix[13]), p.part.name);
    }
    expect(colours.get('d1')).toBe('light');
  });

  it('stands every man on the board, none of them through it', () => {
    for (const p of build('chess').placements) {
      if (!/^(silver|gold)/.test(p.part.name)) continue;
      const z = p.matrix[14] + p.part.bounds.min[2];
      expect(z, p.part.name).toBeGreaterThanOrEqual(6.79);
    }
  });
});
