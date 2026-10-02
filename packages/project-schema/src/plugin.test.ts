import { describe, expect, it } from 'vitest';
import { PLUGIN_CAPABILITIES, validate } from './index.js';

const manifest = (): Record<string, unknown> => ({
  manifestVersion: 1,
  id: 'acme-gantt',
  name: 'Diagramme de Gantt',
  version: '1.2.0',
  publisher: 'Acme',
  components: [{ id: 'gantt.chart', tag: 'acs-x-gantt-chart' }],
  capabilities: ['data.read'],
  entry: 'dist/gantt.js',
  integrity: 'a'.repeat(64),
});

const issues = (document: unknown) => {
  const result = validate('PluginManifest', document);
  return result.ok
    ? []
    : (result.error.details as { issues: { path: string; keyword: string }[] }).issues.map(
        (issue) => `${issue.keyword} ${issue.path}`,
      );
};

describe('PluginManifest (specified, never loaded: ADR-0034)', () => {
  it('accepts a complete manifest, with or without a signature', () => {
    expect(issues(manifest())).toEqual([]);
    expect(issues({ ...manifest(), signature: 'MEUCIQ...' })).toEqual([]);
  });

  it.each([
    'manifestVersion',
    'id',
    'name',
    'version',
    'publisher',
    'components',
    'capabilities',
    'entry',
    'integrity',
  ])('requires %s', (property) => {
    const document = manifest();
    delete document[property];
    expect(issues(document)).toEqual([`required /${property}`]);
  });

  it('refuses a property it does not know', () => {
    expect(issues({ ...manifest(), autoload: true })).toEqual(['additionalProperties /autoload']);
  });

  it('refuses a manifest version other than 1', () => {
    expect(issues({ ...manifest(), manifestVersion: 2 })).toEqual(['const /manifestVersion']);
  });

  it('refuses an id that is not lower-case words joined by dashes', () => {
    for (const id of ['Acme', 'acme_gantt', '-acme', 'acme--gantt', '1acme', '']) {
      expect(issues({ ...manifest(), id }), id).toContain('pattern /id');
    }
  });

  it('refuses a version that is not SemVer and an integrity that is not a SHA-256', () => {
    expect(issues({ ...manifest(), version: '1.0' })).toEqual(['pattern /version']);
    expect(issues({ ...manifest(), integrity: 'abc' })).toEqual(['pattern /integrity']);
    expect(issues({ ...manifest(), integrity: 'A'.repeat(64) })).toEqual(['pattern /integrity']);
  });

  it('needs at least one component', () => {
    expect(issues({ ...manifest(), components: [] })).toEqual(['minItems /components']);
  });

  it('never lets a plugin take the place of a built-in component family', () => {
    for (const family of [
      'structure',
      'navigation',
      'input',
      'data',
      'info',
      'action',
      'business',
    ]) {
      const components = [{ id: `${family}.list`, tag: 'acs-x-list' }];
      expect(issues({ ...manifest(), components }), family).toEqual(['pattern /components/0/id']);
    }
    expect(
      issues({ ...manifest(), components: [{ id: 'database.list', tag: 'acs-x-list' }] }),
    ).toEqual([]);
  });

  it('refuses a tag that is not a plugin element (acs-x-…)', () => {
    for (const tag of ['acs-data-list', 'my-element', 'acs-x-', 'acs-x-Chart', 'acs-x--a']) {
      expect(issues({ ...manifest(), components: [{ id: 'gantt.chart', tag }] }), tag).toEqual([
        'pattern /components/0/tag',
      ]);
    }
  });

  it('refuses an entry script that leaves the plugin folder or is not a .js file', () => {
    for (const entry of [
      '../evil.js',
      '/evil.js',
      'dist/../evil.js',
      'dist/gantt.html',
      'dist/gantt',
      '',
    ]) {
      expect(issues({ ...manifest(), entry }), entry).toEqual(['pattern /entry']);
    }
  });

  it('refuses a capability that does not exist, and accepts all that do', () => {
    expect(issues({ ...manifest(), capabilities: ['root'] })).toEqual(['enum /capabilities/0']);
    expect(issues({ ...manifest(), capabilities: [...PLUGIN_CAPABILITIES] })).toEqual([]);
  });

  it('refuses an empty signature', () => {
    expect(issues({ ...manifest(), signature: '' })).toEqual(['minLength /signature']);
  });
});
