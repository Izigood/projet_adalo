import { createUuidV7Generator, isUuidV7 } from '@acs/domain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validate } from './index.js';
import type { SchemaName } from './index.js';

/** What actually runs in production: the generated standalone validators, not TypeBox. */
const accepted = (name: SchemaName, values: string[]) =>
  values.filter((value) => !validate(name, value).ok);
const rejected = (name: SchemaName, values: string[]) =>
  values.filter((value) => validate(name, value).ok);

describe('readable key (RG-11)', () => {
  it('accepts lower-case-first keys of 1 to 64 characters', () => {
    const valid = ['a', 'order', 'dueDate', 'a_b9', 'x'.repeat(64), `a${'Z9_'.repeat(21)}`];
    expect(accepted('ReadableKey', valid)).toEqual([]);
  });

  it('rejects empty, too long, upper-case or digit first, and forbidden characters', () => {
    const invalid = [
      '',
      'x'.repeat(65),
      'Order',
      '1order',
      '_order',
      'due-date',
      'due date',
      'échéance',
      'order\n',
      ' order',
      'a.b',
    ];
    expect(rejected('ReadableKey', invalid)).toEqual([]);
  });

  it('rejects anything that is not a string', () => {
    for (const bad of [null, undefined, 12, true, {}, ['a']]) {
      expect(validate('ReadableKey', bad).ok).toBe(false);
    }
  });

  it('property: any valid key stays valid, and inserting a forbidden character breaks it', () => {
    const valid = fc.stringMatching(/^[a-z][a-zA-Z0-9_]{0,62}$/);
    fc.assert(
      fc.property(valid, (key) => validate('ReadableKey', key).ok),
      { numRuns: 1000 },
    );
    fc.assert(
      fc.property(
        valid,
        fc.constantFrom('-', ' ', 'é', '.', '/', '\n', '$'),
        fc.nat(),
        (key, bad, at) => {
          const position = at % (key.length + 1);
          return !validate('ReadableKey', key.slice(0, position) + bad + key.slice(position)).ok;
        },
      ),
      { numRuns: 1000 },
    );
  });
});

describe('project key (RG-11)', () => {
  it('accepts 2 to 16 upper-case letters and digits, starting with a letter', () => {
    expect(accepted('ProjectKey', ['AB', 'ACS', 'A1', 'A'.repeat(16), 'PROJ2026'])).toEqual([]);
  });

  it('rejects too short, too long, lower case, digit first and symbols', () => {
    expect(
      rejected('ProjectKey', ['', 'A', 'A'.repeat(17), 'acs', 'Acs', '1A', 'A-B', 'A_B', 'AB\n']),
    ).toEqual([]);
  });
});

describe('display label', () => {
  it('accepts 1 to 200 characters and rejects empty or longer text', () => {
    expect(accepted('Label', ['É', 'Échéance du dossier', 'x'.repeat(200)])).toEqual([]);
    expect(rejected('Label', ['', 'x'.repeat(201)])).toEqual([]);
  });
});

describe('semantic version', () => {
  it('accepts SemVer 2.0.0 including pre-release and build metadata', () => {
    expect(
      accepted('SemVer', [
        '0.0.0',
        '1.0.0',
        '10.20.30',
        '1.2.3-alpha.1',
        '1.0.0+build.5',
        '1.0.0-rc.1+sha.abc',
      ]),
    ).toEqual([]);
  });

  it('rejects partial, prefixed, zero-padded and malformed versions', () => {
    expect(
      rejected('SemVer', [
        '',
        '1',
        '1.0',
        '01.0.0',
        '1.0.0.0',
        'v1.0.0',
        '1.0.0-',
        'a.b.c',
        '1.0.0+',
      ]),
    ).toEqual([]);
  });
});

describe('dates and instants', () => {
  it('accepts YYYY-MM-DD and UTC instants', () => {
    expect(accepted('IsoDate', ['2026-10-02', '1999-12-31', '2000-01-01'])).toEqual([]);
    expect(
      accepted('IsoDateTimeUtc', [
        '2026-10-02T14:03:07Z',
        '2026-10-02T00:00:00.123Z',
        '2026-12-31T23:59:59.999999999Z',
      ]),
    ).toEqual([]);
  });

  it('rejects impossible months, days, hours and instants that are not UTC', () => {
    expect(
      rejected('IsoDate', [
        '2026-13-01',
        '2026-00-10',
        '2026-10-32',
        '2026-10-00',
        '26-10-02',
        '2026-1-2',
      ]),
    ).toEqual([]);
    expect(
      rejected('IsoDateTimeUtc', [
        '2026-10-02T24:00:00Z',
        '2026-10-02T14:60:00Z',
        '2026-10-02T14:03:07',
        '2026-10-02T14:03:07+02:00',
        '2026-10-02 14:03:07Z',
        '2026-10-02T14:03Z',
      ]),
    ).toEqual([]);
  });
});

describe('component reference, hash, locale, classification', () => {
  it('accepts `famille.nom@majeure`', () => {
    expect(
      accepted('ComponentReference', [
        'data.list@1',
        'structure.stackContainer@12',
        'info.badge@3',
      ]),
    ).toEqual([]);
  });

  it('rejects a reference without major, with major 0, or malformed', () => {
    expect(
      rejected('ComponentReference', [
        'data.list',
        'data.list@0',
        'data.list@01',
        'data@1',
        'Data.list@1',
        'data.List@1',
        'data.list@1.0',
      ]),
    ).toEqual([]);
  });

  it('accepts a lower-case SHA-256 hex digest only', () => {
    expect(accepted('Sha256Hex', ['a'.repeat(64), '0123456789abcdef'.repeat(4)])).toEqual([]);
    expect(
      rejected('Sha256Hex', ['', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64)]),
    ).toEqual([]);
  });

  it('accepts fr and fr-FR style locales only', () => {
    expect(accepted('Locale', ['fr', 'fr-FR', 'en-GB'])).toEqual([]);
    expect(rejected('Locale', ['', 'f', 'fra', 'FR', 'fr_FR', 'fr-fr', 'fr-FRA'])).toEqual([]);
  });

  it('accepts the three classifications of decision D-10 and nothing else', () => {
    expect(accepted('Classification', ['public', 'interne', 'sensible'])).toEqual([]);
    expect(rejected('Classification', ['secret', 'Public', 'internal', ''])).toEqual([]);
  });
});

describe('identifier (UUID v7)', () => {
  it('accepts what the domain generator produces and what isUuidV7 accepts', () => {
    const next = createUuidV7Generator({
      now: () => 1_759_400_000_000,
      randomBytes: (length) => globalThis.crypto.getRandomValues(new Uint8Array(length)),
    });
    const ids = Array.from({ length: 200 }, () => next());
    expect(ids.every((id) => isUuidV7(id) && validate('Uuid7', id).ok)).toBe(true);
  });

  it('rejects labels, other UUID versions, bad variants and upper case', () => {
    expect(
      rejected('Uuid7', [
        'customer',
        '',
        '018f3e2a-7b1c-4d4e-8a3f-0123456789ab',
        '018f3e2a-7b1c-7d4e-0a3f-0123456789ab',
        '018F3E2A-7B1C-7D4E-8A3F-0123456789AB',
      ]),
    ).toEqual([]);
  });

  it('agrees with the domain predicate on arbitrary strings (single pattern source)', () => {
    fc.assert(
      fc.property(fc.string(), (value) => validate('Uuid7', value).ok === isUuidV7(value)),
      { numRuns: 1000 },
    );
  });
});
