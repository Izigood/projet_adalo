import { err, ok } from '@acs/domain';
import type { Result } from '@acs/domain';

/** Longest pattern a field can carry (the manifest schema says the same). */
export const MAX_PATTERN_LENGTH = 500;
/** A repeat inside a repeat may multiply at most this many times. */
const MAX_NESTED_REPEAT = 1000;

type Atom = { readonly weight: number; readonly alternatives?: readonly string[] };
type Frame = { alternatives: string[]; current: string; inner: number; last: Atom | undefined };

function quantifierAt(
  pattern: string,
  index: number,
): { readonly max: number; readonly length: number } | undefined {
  const c = pattern[index];
  if (c === '*' || c === '+') return { max: Infinity, length: 1 };
  if (c === '?') return { max: 1, length: 1 };
  if (c !== '{') return undefined;
  const found = /^\{(\d+)(?:(,)(\d*))?\}/.exec(pattern.slice(index, index + 20));
  if (found === null) return undefined;
  const [text, low, comma, high] = found;
  const max = comma === undefined ? Number(low) : high === '' ? Infinity : Number(high);
  return { max, length: text.length };
}

/** Whether one alternative is the same as, or the start of, another: they overlap. */
function overlap(alternatives: readonly string[]): boolean {
  return alternatives.some((a, i) =>
    alternatives.some((b, j) => i !== j && (a === b || a.startsWith(b))),
  );
}

/**
 * Looks for the shapes of a pattern that make a backtracking engine take exponential time on a
 * hostile input: a repeat inside a repeat that can both go on without end, `(a|a)*` and
 * `(a|ab)*` (alternatives that overlap under a repeat), nested repeats whose product is large,
 * and what hides the search from this analysis (back-references, look-behind).
 *
 * This is a heuristic, not a proof, and it errs on the side of refusing: `^([a-z]+-)+[a-z]+$` is
 * refused although it is linear. It does not see polynomial cases such as `.*.*.*x`; those are
 * bounded by the length of the checked value (255 for a string field).
 */
function unsafeShape(pattern: string): string | undefined {
  const root: Frame = { alternatives: [], current: '', inner: 1, last: undefined };
  const stack: Frame[] = [root];
  const top = (): Frame => stack[stack.length - 1] ?? root;
  let index = 0;
  while (index < pattern.length) {
    const frame = top();
    const c = pattern[index];
    if (c === '\\') {
      const next = pattern[index + 1] ?? '';
      if (/[1-9]/.test(next) || (next === 'k' && pattern[index + 2] === '<')) {
        return 'back-references can make a search take exponential time';
      }
      frame.current += pattern.slice(index, index + 2);
      frame.last = { weight: 1 };
      index += 2;
    } else if (c === '[') {
      let end = index + 1;
      while (end < pattern.length && pattern[end] !== ']') end += pattern[end] === '\\' ? 2 : 1;
      frame.current += pattern.slice(index, end + 1);
      frame.last = { weight: 1 };
      index = end + 1;
    } else if (c === '(') {
      if (pattern.startsWith('(?<=', index) || pattern.startsWith('(?<!', index)) {
        return 'look-behind is not allowed';
      }
      const prefix = /^\(\?(?::|=|!|<[A-Za-z_][A-Za-z0-9_]*>)/.exec(
        pattern.slice(index, index + 40),
      );
      stack.push({ alternatives: [], current: '', inner: 1, last: undefined });
      index += prefix === null ? 1 : prefix[0].length;
    } else if (c === ')') {
      if (stack.length === 1) return 'unbalanced parenthesis';
      const closed = stack.pop() as Frame;
      closed.alternatives.push(closed.current);
      const parent = top();
      parent.current += `(${closed.alternatives.join('|')})`;
      parent.last = { weight: closed.inner, alternatives: closed.alternatives };
      parent.inner = Math.max(parent.inner, closed.inner);
      index += 1;
    } else if (c === '|') {
      frame.alternatives.push(frame.current);
      frame.current = '';
      frame.last = undefined;
      index += 1;
    } else {
      const quantifier = quantifierAt(pattern, index);
      if (quantifier === undefined || frame.last === undefined) {
        frame.current += c ?? '';
        frame.last = { weight: 1 };
        index += 1;
        continue;
      }
      const { weight, alternatives } = frame.last;
      const product = weight * quantifier.max;
      if (weight > 1 && quantifier.max > 1) {
        if (weight === Infinity && quantifier.max === Infinity) {
          return 'a repeat inside a repeat can take exponential time';
        }
        if (product > MAX_NESTED_REPEAT) return 'nested repeats multiply too many times';
      }
      if (alternatives !== undefined && quantifier.max === Infinity && overlap(alternatives)) {
        return 'overlapping alternatives under a repeat can take exponential time';
      }
      frame.current += pattern.slice(index, index + quantifier.length);
      frame.last = { weight: Math.max(weight, product) };
      frame.inner = Math.max(frame.inner, product);
      index += quantifier.length;
      if (pattern[index] === '?') index += 1;
    }
  }
  return stack.length === 1 ? undefined : 'unbalanced parenthesis';
}

/** A pattern that compiles and has none of the shapes above, as a regular expression. */
export function safeRegExp(pattern: string): Result<RegExp, string> {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return err(`a pattern has at most ${MAX_PATTERN_LENGTH} characters`);
  }
  let compiled: RegExp;
  try {
    compiled = new RegExp(pattern, 'u');
  } catch {
    return err('the pattern is not a valid regular expression');
  }
  const reason = unsafeShape(pattern);
  return reason === undefined ? ok(compiled) : err(reason);
}
