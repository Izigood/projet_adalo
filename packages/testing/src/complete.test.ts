import {
  BREAKPOINTS,
  CLASSIFICATIONS,
  ENTITY_KINDS,
  FIELD_TYPES,
  VARIABLE_TYPES,
  WORKFLOW_NODE_TYPES,
  schemaForPath,
} from '@acs/project-schema';
import type { EntitiesFile, Page, ProjectManifest, SecretRef, Workflow } from '@acs/project-schema';
import { describe, expect, it } from 'vitest';
import { completeFixture } from './index.js';

const files = completeFixture();
const { entities } = files['schema/entities.json'] as EntitiesFile;
const pages = Object.keys(files)
  .filter((path) => schemaForPath(path) === 'Page')
  .map((path) => files[path] as Page);
const workflows = Object.keys(files)
  .filter((path) => schemaForPath(path) === 'Workflow')
  .map((path) => files[path] as Workflow);
const nodes = pages.flatMap((page) => Object.values(page.nodes));
const manifest = files['project.json'] as ProjectManifest;

const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

describe('complete fixture covers what the manifest can express', () => {
  it('uses each of the 13 field types', () => {
    const used = entities.flatMap((entity) => entity.fields.map((field) => field.type));
    expect(sorted(used)).toEqual(sorted(FIELD_TYPES));
  });

  it('uses each of the 22 workflow node types, and each variable type', () => {
    const types = workflows.flatMap((workflow) => workflow.nodes.map((node) => node.type));
    expect(sorted(types)).toEqual(sorted(WORKFLOW_NODE_TYPES));
    const variables = workflows.flatMap((workflow) => workflow.variables.map((v) => v.type));
    expect(sorted(variables)).toEqual(sorted(VARIABLE_TYPES));
  });

  it('uses the three entity kinds and the three classifications', () => {
    expect(sorted(entities.map((entity) => entity.kind))).toEqual(sorted(ENTITY_KINDS));
    const classifications = entities.flatMap((entity) => [
      entity.classification,
      ...entity.fields.map((field) => field.classification),
    ]);
    expect(sorted(classifications)).toEqual(sorted(CLASSIFICATIONS));
  });

  it('uses both sources of a choice, both guard kinds and both trigger kinds', () => {
    const sources = entities.flatMap((entity) =>
      entity.fields.flatMap((field) =>
        field.type === 'choice' || field.type === 'multiChoice' ? [field.options.source.kind] : [],
      ),
    );
    expect(sorted(sources)).toEqual(['dictionary', 'list']);
    expect(sorted(pages.flatMap((page) => page.guards.map((guard) => guard.kind)))).toEqual([
      'expression',
      'role',
    ]);
    expect(sorted(workflows.map((workflow) => workflow.trigger.kind))).toEqual(['event', 'manual']);
  });

  it('overrides props at the three breakpoints, and uses bindings, events, visibleWhen and locked', () => {
    const breakpoints = nodes.flatMap((node) => Object.keys(node.responsive ?? {}));
    expect(sorted(breakpoints)).toEqual(sorted(BREAKPOINTS));
    expect(nodes.some((node) => node.bindings !== undefined)).toBe(true);
    expect(nodes.some((node) => node.events !== undefined)).toBe(true);
    expect(nodes.some((node) => node.visibleWhen !== undefined)).toBe(true);
    expect(nodes.some((node) => node.locked === true)).toBe(true);
  });

  it('has a page with a route parameter and a themed brand with assets and both modes', () => {
    expect(pages.some((page) => page.params.length > 0 && page.route.includes(':'))).toBe(true);
    const theme = Object.keys(files)
      .filter((path) => schemaForPath(path) === 'Theme')
      .map((path) => files[path] as { assets: Record<string, string>; modes: object })[0];
    expect(Object.keys(theme?.assets ?? {}).sort()).toEqual(['icon', 'logo']);
    expect(Object.keys(theme?.modes ?? {}).sort()).toEqual(['dark', 'light']);
  });

  it('references secrets by name only: no value anywhere in the package', () => {
    const refs = manifest.secretRefs as SecretRef[];
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(Object.keys(ref).sort()).toEqual(['description', 'id', 'key']);
    const text = JSON.stringify(files).toLowerCase();
    for (const word of ['"password"', '"secret"', '"token"', '"apikey"', '"value":"hunter']) {
      expect(text).not.toContain(word);
    }
  });

  it('declares every component it uses and uses every component it declares', () => {
    const used = nodes.map((node) => node.component);
    expect(sorted(manifest.dependencies.components)).toEqual(sorted(used));
  });

  it('chains the 22 node types of its workflow from start to end', () => {
    const [every] = workflows.filter((workflow) => workflow.key === 'everyNode');
    expect(every?.nodes[0]?.type).toBe('start');
    expect(every?.nodes.at(-1)?.type).toBe('end');
    expect(every?.edges).toHaveLength((every?.nodes.length ?? 0) - 1);
  });
});
