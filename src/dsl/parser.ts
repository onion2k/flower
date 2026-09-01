import type { Action, Arg, Expr, Placement, Program, Stmt } from './ast';
import { DslError, type Span, type Token, tokenize } from './lexer';

/**
 * Recursive descent over a deliberately small grammar.
 *
 * Every construct exists because the layers underneath already have it: parts,
 * anchor mating, symmetry groups and materials. The DSL adds no capability of its
 * own — it is a second front end onto the same Assembly the TypeScript builder
 * produces, which is why it could be designed last without being bolted on.
 */
export function parse(source: string): Program {
  const tokens = tokenize(source);
  let pos = 0;

  const peek = () => tokens[pos];
  const at = (text: string) => peek().text === text && peek().kind !== 'string';
  const atIdent = () => peek().kind === 'ident';
  const next = () => tokens[pos++];

  const expect = (text: string, context: string): Token => {
    if (!at(text)) {
      throw new DslError(`expected "${text}" ${context}, found "${describe(peek())}"`, peek().span);
    }
    return next();
  };

  const expectIdent = (context: string): Token => {
    if (!atIdent()) {
      throw new DslError(`expected a name ${context}, found "${describe(peek())}"`, peek().span);
    }
    return next();
  };

  const spanFrom = (start: Span): Span => ({
    start: start.start,
    end: tokens[Math.max(pos - 1, 0)].span.end,
    line: start.line,
    column: start.column,
  });

  // --- expressions, by precedence climbing ---

  function parsePrimary(): Expr {
    const token = peek();

    if (token.kind === 'number') { next(); return { kind: 'number', value: token.value!, span: token.span }; }
    if (token.kind === 'string') { next(); return { kind: 'string', value: token.text, span: token.span }; }

    if (at('-')) {
      next();
      const operand = parseUnary();
      return { kind: 'unary', op: '-', operand, span: spanFrom(token.span) };
    }

    if (at('(')) {
      next();
      const items: Expr[] = [parseExpr()];
      while (at(',')) { next(); items.push(parseExpr()); }
      expect(')', 'to close a group');
      if (items.length === 1) return items[0];
      if (items.length !== 3) {
        throw new DslError(
          `a point needs three numbers, found ${items.length}`,
          spanFrom(token.span),
        );
      }
      return { kind: 'vector', items, span: spanFrom(token.span) };
    }

    if (token.kind === 'ident') {
      next();
      if (at('(')) {
        next();
        const args: Arg[] = [];
        while (!at(')')) {
          const argStart = peek().span;
          let name: string | undefined;
          if (peek().kind === 'ident' && tokens[pos + 1]?.text === ':') {
            name = next().text;
            next();
          }
          args.push({ name, value: parseExpr(), span: spanFrom(argStart) });
          if (at(',')) next();
          else break;
        }
        expect(')', `to close the arguments of "${token.text}"`);
        return { kind: 'call', callee: token.text, args, span: spanFrom(token.span) };
      }
      return { kind: 'ident', name: token.text, span: token.span };
    }

    throw new DslError(`unexpected "${describe(token)}"`, token.span);
  }

  function parseUnary(): Expr {
    if (at('-')) {
      const start = next().span;
      return { kind: 'unary', op: '-', operand: parseUnary(), span: spanFrom(start) };
    }
    return parsePrimary();
  }

  function parseBinary(minPrecedence: number): Expr {
    let left = parseUnary();
    for (;;) {
      const op = peek().text;
      const precedence = op === '*' || op === '/' ? 2 : op === '+' || op === '-' ? 1 : 0;
      if (peek().kind !== 'punct' || precedence < minPrecedence || precedence === 0) return left;
      next();
      const right = parseBinary(precedence + 1);
      left = { kind: 'binary', op: op as '+' | '-' | '*' | '/', left, right, span: left.span };
    }
  }

  const parseExpr = () => parseBinary(1);

  // --- material names may be several words: "rose-gold polished" ---

  function parseMaterial(): { metal: string; finish?: string } {
    const metal = expectIdent('as a metal').text.replace(/-/g, ' ');
    let finish: string | undefined;
    // a following keyword starts the next statement, it is not a finish name
    if (atIdent() && !isActionKeyword(peek().text) && !isStatementKeyword(peek().text)) {
      finish = next().text;
    }
    return { metal, finish };
  }

  // --- placements ---

  function parsePlacement(): Placement {
    const start = peek().span;
    const placement: Placement = { span: start };
    for (;;) {
      if (at('at')) { next(); placement.at = parseExpr(); continue; }
      if (at('turn')) { next(); placement.turn = parseExpr(); continue; }
      if (at('pitch')) { next(); placement.pitch = parseExpr(); continue; }
      if (at('roll')) { next(); placement.roll = parseExpr(); continue; }
      if (at('scale')) { next(); placement.scale = parseExpr(); continue; }
      if (at('offset')) { next(); placement.offset = parseExpr(); continue; }
      if (at('flip')) { next(); placement.flip = true; continue; }
      if (at('as')) { next(); placement.as = expectIdent('after "as"').text; continue; }
      if (at('in')) {
        next();
        const m = parseMaterial();
        placement.metal = m.metal;
        placement.finish = m.finish;
        continue;
      }
      break;
    }
    placement.span = spanFrom(start);
    return placement;
  }

  // --- actions ---

  function parseAction(): Action {
    const start = peek().span;

    if (at('place')) {
      next();
      const part = parseExpr();
      return { kind: 'place', part, placement: parsePlacement(), span: spanFrom(start) };
    }

    if (at('fasten')) {
      next();
      const part = parseExpr();
      let partAnchor: string | undefined;
      if (at('.')) {
        next();
        partAnchor = expectIdent('as the anchor to fasten by').text;
      }
      expect('to', 'after the part being fastened');
      const owner = expectIdent('as the part being fastened to').text;
      expect('.', 'between a part and its anchor');
      const anchor = expectIdent('as an anchor name').text;
      return {
        kind: 'fasten',
        part,
        partAnchor,
        target: { part: owner, anchor },
        placement: parsePlacement(),
        span: spanFrom(start),
      };
    }

    if (at('repeat')) {
      next();
      const subject = parseExpr();
      expect('around', 'after the thing being repeated');
      const symmetry = parseExpr();
      return { kind: 'repeat', subject, symmetry, span: spanFrom(start) };
    }

    throw new DslError(
      `expected place, fasten or repeat, found "${describe(peek())}"`,
      peek().span,
    );
  }

  function parseBlock(): Action[] {
    expect('{', 'to open a block');
    const actions: Action[] = [];
    while (!at('}')) {
      if (peek().kind === 'eof') {
        throw new DslError('unclosed block — expected "}"', peek().span);
      }
      actions.push(parseAction());
    }
    expect('}', 'to close a block');
    return actions;
  }

  // --- statements ---

  function parseStatement(): Stmt {
    const start = peek().span;

    if (at('material')) {
      next();
      const m = parseMaterial();
      return { kind: 'material', metal: m.metal, finish: m.finish, span: spanFrom(start) };
    }

    if (at('let')) {
      next();
      const name = expectIdent('after "let"').text;
      expect('=', 'after a name in "let"');
      return { kind: 'let', name, value: parseExpr(), span: spanFrom(start) };
    }

    if (at('part')) {
      next();
      const name = expectIdent('after "part"').text;
      expect('=', 'after a part name');
      const value = parseExpr();
      let metal: string | undefined;
      let finish: string | undefined;
      if (at('in')) {
        next();
        const m = parseMaterial();
        metal = m.metal;
        finish = m.finish;
      }
      return { kind: 'part', name, value, metal, finish, span: spanFrom(start) };
    }

    if (at('unit') || at('form')) {
      const keyword = next().text as 'unit' | 'form';
      const name = expectIdent(`after "${keyword}"`).text;
      return { kind: keyword, name, actions: parseBlock(), span: spanFrom(start) };
    }

    throw new DslError(
      `expected material, let, part, unit or form, found "${describe(peek())}"`,
      peek().span,
    );
  }

  const statements: Stmt[] = [];
  while (peek().kind !== 'eof') statements.push(parseStatement());
  return { statements };
}

const ACTION_KEYWORDS = [
  'place', 'fasten', 'repeat', 'at', 'turn', 'pitch', 'roll',
  'scale', 'offset', 'flip', 'as', 'in', 'to', 'around',
];
const isActionKeyword = (text: string) => ACTION_KEYWORDS.includes(text);

const STATEMENT_KEYWORDS = ['material', 'let', 'part', 'unit', 'form'];
const isStatementKeyword = (text: string) => STATEMENT_KEYWORDS.includes(text);

const describe = (token: Token) => (token.kind === 'eof' ? 'end of sketch' : token.text);
