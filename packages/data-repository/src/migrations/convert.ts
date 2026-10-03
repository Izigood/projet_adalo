import { err, ok } from '@acs/domain';
import type { JsonValue, Result } from '@acs/domain';
import type { Field } from '@acs/project-schema';
import { checkFieldValue } from '../values/field-value.js';

/** How the values of a field become those of another type (`changeType`, dossier 6.5). */
export type Conversion = {
  /** Information is thrown away (`datetime` to `date`): the step is destructive. */
  readonly lossy: boolean;
  /** The new value, already checked against the new field, or why this one cannot be converted. */
  convert(value: JsonValue): Result<JsonValue, string>;
};

type Step = (value: JsonValue) => Result<JsonValue, string>;

const same: Step = (value) => ok(value);
const text: Step = (value) => ok(String(value));

const toInteger: Step = (value) =>
  typeof value === 'string' && /^-?\d+$/.test(value) && Number.isSafeInteger(Number(value))
    ? ok(Number(value))
    : err('the text is not an integer that fits');

const toBoolean: Step = (value) =>
  value === 'true' || value === 'false'
    ? ok(value === 'true')
    : err('the text is not true or false');

const TEXT = ['string', 'text'] as const;

/**
 * The conversions the engine knows, by `from>to`. Anything else is refused when the plan is made:
 * the designer removes the field and adds another. A conversion that can fail on some value
 * (text to integer) is not refused: the value that fails is named when the migration runs.
 */
const STEPS: Readonly<Record<string, { step: Step; lossy?: boolean }>> = {
  'string>text': { step: same },
  'text>string': { step: same },
  'decimal>decimal': { step: same },
  'integer>decimal': { step: text },
  'date>datetime': { step: (value) => ok(`${String(value)}T00:00:00Z`) },
  'datetime>date': { step: (value) => ok(String(value).slice(0, 10)), lossy: true },
  ...Object.fromEntries(
    TEXT.flatMap((from) => [
      [`${from}>integer`, { step: toInteger }],
      [`${from}>decimal`, { step: same }],
      [`${from}>boolean`, { step: toBoolean }],
      [`${from}>date`, { step: same }],
      [`${from}>datetime`, { step: same }],
      [`${from}>choice`, { step: same }],
    ]),
  ),
  ...Object.fromEntries(
    TEXT.flatMap((to) =>
      ['integer', 'boolean'].map((from) => [`${from}>${to}`, { step: text }] as const),
    ),
  ),
  ...Object.fromEntries(
    TEXT.flatMap((to) =>
      ['decimal', 'date', 'datetime', 'choice'].map(
        (from) => [`${from}>${to}`, { step: same }] as const,
      ),
    ),
  ),
};

/** The conversion from one field to another, or undefined when the engine has none. */
export function conversionFor(from: Field, to: Field): Conversion | undefined {
  const entry = STEPS[`${from.type}>${to.type}`];
  if (entry === undefined) return undefined;
  return {
    lossy: entry.lossy === true,
    convert(value) {
      const converted = entry.step(value);
      if (!converted.ok) return converted;
      const checked = checkFieldValue(to, converted.value);
      return checked.ok ? checked : err(`${checked.error.rule}: ${checked.error.message}`);
    },
  };
}
