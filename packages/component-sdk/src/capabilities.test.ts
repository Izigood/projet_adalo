import { PLUGIN_CAPABILITIES, PluginManifest } from '@acs/project-schema';
import { describe, expect, it } from 'vitest';
import { CAPABILITIES } from './definition.js';

/**
 * project-schema cannot import component-sdk (and the reverse is not wanted either for the schema),
 * so the capabilities exist in both. This is the one place that sees both, to keep them equal.
 */
describe('the capabilities of a plugin and of a component', () => {
  it('are the same list', () => {
    expect([...PLUGIN_CAPABILITIES]).toEqual([...CAPABILITIES]);
  });

  it('are the ones the manifest schema accepts', () => {
    const items = (
      PluginManifest.properties.capabilities as unknown as {
        items: { enum?: string[]; anyOf?: { const: string }[] };
      }
    ).items;
    const accepted = items.enum ?? items.anyOf?.map((choice) => choice.const) ?? [];
    expect([...accepted].sort()).toEqual([...CAPABILITIES].sort());
  });
});
