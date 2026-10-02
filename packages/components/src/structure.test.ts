import { beforeAll, describe, expect, it } from 'vitest';
import { MAX_COLUMNS, defineBaseElements } from './index.js';
import { AcsStructureGrid } from './structure/grid.js';
import { child, mount } from './test-helpers.js';

beforeAll(() => defineBaseElements());

const cssOf = (styles: unknown): string =>
  (Array.isArray(styles) ? styles : [styles]).map((sheet) => String(sheet.cssText)).join('\n');

describe('structure.page', () => {
  it('bounds its width: wide by default, narrow or full on request', async () => {
    expect((await mount('acs-structure-page', {})).getAttribute('width')).toBe('wide');
    expect((await mount('acs-structure-page', { width: 'narrow' })).getAttribute('width')).toBe(
      'narrow',
    );
    expect((await mount('acs-structure-page', { width: 'full' })).getAttribute('width')).toBe(
      'full',
    );
  });

  it('is a generic container and shows its children', async () => {
    const page = await mount('acs-structure-page', {}, [child('p', 'Bonjour')]);
    expect(page.getAttribute('role')).toBe('none');
    expect(page.shadowRoot?.querySelector('slot')).not.toBeNull();
    expect(page.textContent).toBe('Bonjour');
  });

  it('follows its props when they change', async () => {
    const page = await mount('acs-structure-page', { width: 'narrow' });
    page.props = { width: 'full' };
    await page.updateComplete;
    expect(page.getAttribute('width')).toBe('full');
  });

  it('renders without props at all', async () => {
    const page = await mount('acs-structure-page', undefined);
    expect(page.getAttribute('width')).toBe('wide');
  });
});

describe('structure.section', () => {
  it('is a region named by its title', async () => {
    const section = await mount('acs-structure-section', { title: 'Commandes', level: 2 });
    const region = section.shadowRoot?.querySelector('section');
    const heading = section.shadowRoot?.querySelector('#title');
    expect(region?.getAttribute('aria-labelledby')).toBe('title');
    expect(heading?.textContent).toBe('Commandes');
  });

  it.each([
    [2, 'H2'],
    [3, 'H3'],
    [4, 'H4'],
  ])('uses a level %i heading', async (level, tag) => {
    const section = await mount('acs-structure-section', { title: 'T', level });
    expect(section.shadowRoot?.querySelector('#title')?.tagName).toBe(tag);
  });

  it('shows its title as text, never as markup', async () => {
    const section = await mount('acs-structure-section', { title: '<img src=x onerror=alert(1)>' });
    expect(section.shadowRoot?.querySelector('img')).toBeNull();
    expect(section.shadowRoot?.querySelector('#title')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });

  it('shows its children', async () => {
    const section = await mount('acs-structure-section', { title: 'T' }, [child('p', 'Contenu')]);
    expect(section.shadowRoot?.querySelector('slot')).not.toBeNull();
    expect(section.textContent).toBe('Contenu');
  });
});

describe('structure.stack', () => {
  it('has a vertical, medium, stretched layout by default', async () => {
    const stack = await mount('acs-structure-stack', {});
    expect(stack.getAttribute('direction')).toBe('vertical');
    expect(stack.getAttribute('gap')).toBe('md');
    expect(stack.getAttribute('align')).toBe('stretch');
  });

  it('takes the direction, gap and alignment it is given', async () => {
    const stack = await mount('acs-structure-stack', {
      direction: 'horizontal',
      gap: 'lg',
      align: 'center',
    });
    expect(stack.getAttribute('direction')).toBe('horizontal');
    expect(stack.getAttribute('gap')).toBe('lg');
    expect(stack.getAttribute('align')).toBe('center');
  });

  it('has a style rule for every value it can reflect', () => {
    const css = cssOf(
      (customElements.get('acs-structure-stack') as unknown as { styles: unknown }).styles,
    );
    for (const rule of [
      "direction='horizontal'",
      "gap='sm'",
      "gap='lg'",
      "align='start'",
      "align='center'",
      "align='end'",
    ]) {
      expect(css.replaceAll('"', "'"), rule).toContain(rule);
    }
  });
});

describe('structure.grid', () => {
  it.each([1, 2, 4, 12])('reflects %i columns on the host', async (columns) => {
    const grid = await mount('acs-structure-grid', { columns, gap: 'md' });
    expect(grid.getAttribute('columns')).toBe(String(columns));
  });

  it('has one column by default', async () => {
    expect((await mount('acs-structure-grid', undefined)).getAttribute('columns')).toBe('1');
  });

  it(`has a style rule for each of the ${MAX_COLUMNS} column counts, and only those`, () => {
    const css = cssOf(AcsStructureGrid.styles).replaceAll('"', "'");
    for (let n = 1; n <= MAX_COLUMNS; n += 1) {
      expect(css, String(n)).toContain(`columns='${n}'`);
      expect(css).toContain(`repeat(${n}, minmax(0, 1fr))`);
    }
    expect(css).not.toContain(`columns='${MAX_COLUMNS + 1}'`);
  });

  it('changes its column count when its props change (a breakpoint override)', async () => {
    const grid = await mount('acs-structure-grid', { columns: 4 });
    grid.props = { columns: 1 };
    await grid.updateComplete;
    expect(grid.getAttribute('columns')).toBe('1');
  });
});
