import { describe, expect, it } from 'vitest';
import {
  BREAKPOINT_MIN_WIDTH,
  BREAKPOINT_QUERIES,
  breakpointOf,
  ignoredOverrides,
  resolveProps,
} from './breakpoints.js';

describe('breakpointOf (EF-UI-04)', () => {
  it('flips exactly at 600 and 1024 px', () => {
    expect(breakpointOf(0)).toBe('mobile');
    expect(breakpointOf(360)).toBe('mobile');
    expect(breakpointOf(599)).toBe('mobile');
    expect(breakpointOf(599.9)).toBe('mobile');
    expect(breakpointOf(600)).toBe('tablet');
    expect(breakpointOf(768)).toBe('tablet');
    expect(breakpointOf(1023)).toBe('tablet');
    expect(breakpointOf(1024)).toBe('desktop');
    expect(breakpointOf(1280)).toBe('desktop');
    expect(breakpointOf(10_000)).toBe('desktop');
  });

  it('classifies every width from 0 to 2 000 px consistently with the thresholds', () => {
    for (let width = 0; width <= 2000; width += 1) {
      const expected = width < 600 ? 'mobile' : width < 1024 ? 'tablet' : 'desktop';
      expect(breakpointOf(width), String(width)).toBe(expected);
    }
  });

  it('treats a width that is not a usable number as mobile', () => {
    for (const width of [Number.NaN, -1, -Infinity]) expect(breakpointOf(width)).toBe('mobile');
  });

  it('has media queries that flip at the same widths', () => {
    expect(BREAKPOINT_QUERIES.tablet).toBe(`(min-width: ${BREAKPOINT_MIN_WIDTH.tablet}px)`);
    expect(BREAKPOINT_QUERIES.desktop).toBe(`(min-width: ${BREAKPOINT_MIN_WIDTH.desktop}px)`);
  });
});

describe('resolveProps', () => {
  const definition = { responsive: ['columns', 'gap'] };
  const node = {
    props: { columns: 4, gap: 'md', title: 'T' },
    responsive: { mobile: { columns: 1 }, tablet: { columns: 2, gap: 'sm' } },
  };

  it('lays the overrides of the breakpoint over the props', () => {
    expect(resolveProps(definition, node, 'mobile')).toEqual({ columns: 1, gap: 'md', title: 'T' });
    expect(resolveProps(definition, node, 'tablet')).toEqual({ columns: 2, gap: 'sm', title: 'T' });
  });

  it('applies nothing at a breakpoint that has no override, and when there is no responsive part', () => {
    expect(resolveProps(definition, node, 'desktop')).toEqual(node.props);
    expect(resolveProps(definition, { props: { columns: 4 } }, 'mobile')).toEqual({ columns: 4 });
  });

  it('ignores an override of a prop the component does not allow', () => {
    const sneaky = {
      props: { title: 'T' },
      responsive: { mobile: { title: 'Hacked', columns: 1 } },
    };
    expect(resolveProps(definition, sneaky, 'mobile')).toEqual({ title: 'T', columns: 1 });
    expect(resolveProps({ responsive: [] }, sneaky, 'mobile')).toEqual({ title: 'T' });
    expect(resolveProps({}, sneaky, 'mobile')).toEqual({ title: 'T' });
  });

  it('cannot be used to pollute a prototype', () => {
    const hostile = JSON.parse('{"props":{},"responsive":{"mobile":{"__proto__":{"x":1}}}}');
    const resolved = resolveProps({ responsive: ['__proto__'] }, hostile, 'mobile');
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
    expect(Object.getPrototypeOf(resolved)).toBe(Object.prototype);
  });

  it('does not modify the node', () => {
    const frozen = structuredClone(node);
    Object.freeze(frozen.props);
    expect(() => resolveProps(definition, frozen, 'mobile')).not.toThrow();
    expect(frozen.props.columns).toBe(4);
  });
});

describe('ignoredOverrides', () => {
  it('lists the overrides the component does not allow, with their breakpoint', () => {
    const node = {
      props: {},
      responsive: { mobile: { columns: 1, title: 'x' }, desktop: { color: 'red' } },
    };
    expect(ignoredOverrides({ responsive: ['columns'] }, node)).toEqual([
      { breakpoint: 'mobile', prop: 'title' },
      { breakpoint: 'desktop', prop: 'color' },
    ]);
    expect(ignoredOverrides({ responsive: ['columns', 'title', 'color'] }, node)).toEqual([]);
  });
});
