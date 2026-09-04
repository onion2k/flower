import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { BUILTIN_NAMES } from '../dsl/builtins';

/**
 * Highlighting for the sketch language.
 *
 * A stream tokenizer rather than a Lezer grammar: the real parser lives in
 * src/dsl and is the only thing that decides what a sketch means. This exists
 * to colour the text, and a hand-rolled scanner does that from the same token
 * rules the lexer uses without a second grammar to keep in step.
 */
const STATEMENT = new Set(['use', 'material', 'let', 'part', 'unit', 'form']);
const ACTION = new Set(['place', 'fasten', 'repeat']);
const MODIFIER = new Set([
  'at', 'turn', 'pitch', 'roll', 'scale', 'offset', 'flip', 'as', 'in', 'to', 'around', 'engraved', 'glow',
]);
const BUILTIN = new Set(BUILTIN_NAMES);

export const sketchLanguage = StreamLanguage.define({
  name: 'sketch',
  token(stream) {
    if (stream.eatSpace()) return null;
    if (stream.match('#')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match(/^"[^"\n]*"?/)) return 'string';
    if (stream.match(/^(\d+\.?\d*|\.\d+)/)) {
      // the unit is coloured with the number it belongs to
      stream.match(/^[a-zA-Z]+/);
      return 'number';
    }
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
      const word = stream.current();
      if (STATEMENT.has(word)) return 'keyword';
      if (ACTION.has(word)) return 'controlKeyword';
      if (MODIFIER.has(word)) return 'modifier';
      if (BUILTIN.has(word) && stream.peek() === '(') return 'function';
      // the part of a "part.anchor" reference
      if (stream.peek() === '.') return 'variableName';
      return null;
    }
    if (stream.match(/^[{}()]/)) return 'bracket';
    if (stream.match(/^[+\-*\/=]/)) return 'operator';
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: '#' } },
});

/** Colours drawn from the panel's palette: gold for the words that build, muted for the rest. */
export const sketchHighlighting = syntaxHighlighting(HighlightStyle.define([
  { tag: tags.comment, color: '#5f6875', fontStyle: 'italic' },
  { tag: tags.keyword, color: '#c9a227' },
  { tag: tags.controlKeyword, color: '#e0b84a' },
  { tag: tags.modifier, color: '#8fa3c7' },
  { tag: tags.function(tags.variableName), color: '#7fc8d8' },
  { tag: tags.variableName, color: '#d8dce3' },
  { tag: tags.number, color: '#e9c79b' },
  { tag: tags.string, color: '#a8d08d' },
  { tag: tags.operator, color: '#838b98' },
  { tag: tags.bracket, color: '#838b98' },
]));
