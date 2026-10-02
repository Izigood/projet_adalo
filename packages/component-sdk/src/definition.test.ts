import { describe, expect, it } from 'vitest';
import { CAPABILITIES, COMPONENT_CATEGORIES, majorOf, parseRef, refOf } from './definition.js';

describe('majorOf', () => {
  it('reads the major version of a SemVer string', () => {
    expect(majorOf('1.0.0')).toBe(1);
    expect(majorOf('12.3.4')).toBe(12);
    expect(majorOf('2.0.0-beta.1')).toBe(2);
  });

  it('refuses what is not SemVer', () => {
    for (const bad of ['', '1', '1.0', 'v1.0.0', '01.0.0', '1.0.0.0', 'latest']) {
      expect(majorOf(bad), bad).toBeUndefined();
    }
  });
});

describe('refOf and parseRef', () => {
  it('writes the reference of a definition with its major version', () => {
    expect(refOf({ id: 'structure.stack', version: '1.4.2' })).toBe('structure.stack@1');
    expect(refOf({ id: 'structure.tabs', version: '2.0.0' })).toBe('structure.tabs@2');
  });

  it('splits a reference, and refuses what the manifest pattern refuses', () => {
    expect(parseRef('info.title@1')).toEqual({ id: 'info.title', major: 1 });
    expect(parseRef('structure.sidePanel@12')).toEqual({ id: 'structure.sidePanel', major: 12 });
    for (const bad of ['info.title', 'info.title@0', 'Info.title@1', 'title@1', 'a.b@1@2', '']) {
      expect(parseRef(bad), bad).toBeUndefined();
    }
  });

  it('round-trips: the reference of a definition parses back to its id and major', () => {
    const definition = { id: 'action.button', version: '3.1.0' };
    expect(parseRef(refOf(definition))).toEqual({ id: 'action.button', major: 3 });
  });
});

describe('the lists of the contract', () => {
  it('has the 7 categories of dossier 7.3', () => {
    expect([...COMPONENT_CATEGORIES]).toEqual([
      'structure',
      'navigation',
      'input',
      'data',
      'info',
      'action',
      'business',
    ]);
  });

  it('has the capabilities that are refused by default', () => {
    expect([...CAPABILITIES]).toEqual(['data.read', 'data.write', 'files.read', 'files.write']);
  });
});
