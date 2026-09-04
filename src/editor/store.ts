/**
 * Where sketches are kept between visits: the browser's localStorage.
 *
 * Two shelves. "Mine" holds sketches the writer has named and owns, saved on
 * every edit. Drafts hold edits to the built-in examples, keyed by the
 * example's name, so that trying something on the rosette survives a look
 * at the egg — and can be thrown away to get the original back.
 */
const MINE = 'artshape.sketches';
const DRAFTS = 'artshape.drafts';
const SUBJECT = 'artshape.subject';
const EDITOR_HEIGHT = 'artshape.editorHeight';

type Shelf = Record<string, string>;

function read(key: string): Shelf {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function write(key: string, shelf: Shelf) {
  try {
    if (Object.keys(shelf).length) localStorage.setItem(key, JSON.stringify(shelf));
    else localStorage.removeItem(key);
  } catch { /* storage full or unavailable: the sketch stays on screen, just not on the shelf */ }
}

export const store = {
  mine: (): Shelf => read(MINE),
  mineNames: (): string[] => Object.keys(read(MINE)).sort(),
  save(name: string, source: string) {
    const shelf = read(MINE);
    shelf[name] = source;
    write(MINE, shelf);
  },
  remove(name: string) {
    const shelf = read(MINE);
    delete shelf[name];
    write(MINE, shelf);
  },

  draft: (name: string): string | undefined => read(DRAFTS)[name],
  setDraft(name: string, source: string | undefined) {
    const shelf = read(DRAFTS);
    if (source === undefined) delete shelf[name];
    else shelf[name] = source;
    write(DRAFTS, shelf);
  },

  subject: (): string | null => { try { return localStorage.getItem(SUBJECT); } catch { return null; } },
  setSubject(value: string) { try { localStorage.setItem(SUBJECT, value); } catch { /* as above */ } },

  editorHeight: (): number | null => { try { return Number(localStorage.getItem(EDITOR_HEIGHT)) || null; } catch { return null; } },
  setEditorHeight(px: number | null) {
    try {
      if (px) localStorage.setItem(EDITOR_HEIGHT, String(px));
      else localStorage.removeItem(EDITOR_HEIGHT);
    } catch { /* as above */ }
  },
};
