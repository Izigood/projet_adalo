import type { DomainError, Id } from '@acs/domain';
import { validateFiles } from '@acs/project-schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createProject } from '../project/create-project.js';
import { fromFiles, toFiles } from '../project/project-state.js';
import type { ProjectState } from '../project/project-state.js';
import { createProjectStore } from '../project/project-store.js';
import { createCommandBus } from './bus.js';
import type { DesignCommand } from './command.js';
import { pageAdd, pageMove, pageRemove, pageRename } from './page-commands.js';

function studio() {
  const store = createProjectStore();
  const bus = createCommandBus(store);
  const made = createProject({ key: 'DEMO', name: 'Demo' });
  if (!made.ok) throw new Error(made.error.message);
  bus.load(made.value);
  const state = (): ProjectState => {
    const open = store.view.getState();
    if (open === null) throw new Error('no project');
    return open;
  };
  const files = () => structuredClone(toFiles(state()));
  const run = (command: DesignCommand) => {
    const result = bus.execute(command);
    if (!result.ok) throw new Error(result.error.message);
    return result.value.changed;
  };
  const add = (key: string): Id<'page'> => {
    const command = pageAdd({ key, route: `/${key}`, title: key });
    run(command);
    return command.payload.pageId;
  };
  const refused = (command: DesignCommand): DomainError => {
    const result = bus.execute(command);
    if (result.ok) throw new Error('the command was accepted');
    return result.error;
  };
  return { store, bus, state, files, run, add, refused };
}

describe('CMD-PAGE-ADD', () => {
  it('adds a page with a title, a route and its place in the order', () => {
    const { state, add } = studio();
    const first = state().initialPageId;
    const id = add('orders');
    const page = state().pages.byId[id];
    expect(page).toMatchObject({ key: 'orders', route: '/orders', params: [], guards: [] });
    expect(page?.nodes[page.rootNodeId]).toMatchObject({
      component: 'info.title@1',
      props: { text: 'orders' },
      children: [],
    });
    expect(state().pages.order).toEqual([first, id]);
    expect(state().routes.at(-1)).toEqual({ pageId: id, route: '/orders' });
  });

  it('gives a package that passes the schemas, and undo gives the project back', () => {
    const { bus, files, add } = studio();
    const before = files();
    add('orders');
    expect(validateFiles(files()).ok).toBe(true);
    bus.undo();
    expect(files()).toEqual(before);
  });

  it('declares the title component the page uses, once, even in a project that did not', () => {
    const { bus, state, files, add } = studio();
    add('first');
    add('second');
    expect(state().components).toEqual(['info.title@1']);
    const bare = files() as unknown as {
      'project.json': { dependencies: { components: string[] } };
    };
    bare['project.json'].dependencies.components = [];
    const reopened = fromFiles(bare);
    if (!reopened.ok) throw new Error(reopened.error.message);
    bus.load(reopened.value);
    expect(state().components).toEqual([]);
    add('third');
    expect(state().components).toEqual(['info.title@1']);
  });

  it.each([
    ['a key that is taken', { key: 'home', route: '/other' }, 'key'],
    ['a route that is taken', { key: 'other', route: '/' }, 'route'],
  ])('refuses %s, and keeps nothing', (_label, spec, field) => {
    const { bus, files, refused } = studio();
    const before = files();
    const error = refused(pageAdd({ ...spec, title: 'x' }));
    expect(error.code).toBe('CONSTRAINT_VIOLATION');
    expect(error.details).toEqual({ field });
    expect(files()).toEqual(before);
    expect(bus.history.getState().undo).toEqual([]);
  });

  it('refuses an identifier that is already a page', () => {
    const { state, refused } = studio();
    const command = pageAdd({ key: 'other', route: '/other', title: 'x' });
    const taken = { ...command, payload: { ...command.payload, pageId: state().initialPageId } };
    expect(refused(taken).details).toEqual({ field: 'pageId' });
  });
});

describe('CMD-PAGE-RENAME', () => {
  it('changes the key and the route of a page, and its entry of the routes', () => {
    const { state, add, run } = studio();
    const id = add('orders');
    run(pageRename({ pageId: id, key: 'purchases', route: '/purchases' }));
    expect(state().pages.byId[id]).toMatchObject({ key: 'purchases', route: '/purchases' });
    expect(state().routes.find((entry) => entry.pageId === id)).toEqual({
      pageId: id,
      route: '/purchases',
    });
  });

  it('can change the key alone, or the route alone', () => {
    const { state, add, run } = studio();
    const id = add('orders');
    run(pageRename({ pageId: id, key: 'purchases' }));
    expect(state().pages.byId[id]).toMatchObject({ key: 'purchases', route: '/orders' });
    run(pageRename({ pageId: id, route: '/buy' }));
    expect(state().pages.byId[id]).toMatchObject({ key: 'purchases', route: '/buy' });
  });

  it('is not a change to give a page the key it has', () => {
    const { add, run } = studio();
    const id = add('orders');
    expect(run(pageRename({ pageId: id, key: 'orders', route: '/orders' }))).toBe(false);
  });

  it('refuses a key or a route that another page has, and a page that does not exist', () => {
    const { state, add, refused } = studio();
    const id = add('orders');
    const home = state().initialPageId;
    expect(refused(pageRename({ pageId: id, key: 'home' })).details).toEqual({ field: 'key' });
    expect(refused(pageRename({ pageId: id, route: '/' })).details).toEqual({ field: 'route' });
    const ghost = pageAdd({ key: 'g', route: '/g', title: 'g' }).payload.pageId;
    expect(refused(pageRename({ pageId: ghost, key: 'x' })).details).toEqual({ field: 'pageId' });
    expect(state().pages.byId[home]?.key).toBe('home');
  });

  it('accepts a key that does not follow RG-11: the autosave decides what is written (RG-13)', () => {
    const { files, add, run } = studio();
    const id = add('orders');
    run(pageRename({ pageId: id, key: 'Not A Key' }));
    expect(validateFiles(files()).ok).toBe(false);
  });
});

describe('CMD-PAGE-REMOVE', () => {
  it('removes the page, its route, and the menu entries that point to it, and undo restores all', () => {
    const { bus, state, store, files, add, run } = studio();
    const id = add('orders');
    const edited = files() as unknown as { 'pages/index.json': { menus: unknown[] } };
    edited['pages/index.json'].menus.push({
      key: 'main',
      label: 'Menu',
      items: [
        { label: 'Commandes', pageId: id },
        { label: 'Accueil', pageId: state().initialPageId },
      ],
    });
    const reopened = fromFiles(edited);
    if (!reopened.ok) throw new Error(reopened.error.message);
    bus.load(reopened.value);
    const before = files();

    run(pageRemove({ pageId: id }));
    expect(store.view.getState()?.pages.byId[id]).toBeUndefined();
    expect(state().pages.order).toEqual([state().initialPageId]);
    expect(state().routes.map((entry) => entry.pageId)).toEqual([state().initialPageId]);
    expect(state().menus[0]?.items.map((item) => item.label)).toEqual(['Accueil']);
    expect(validateFiles(files()).ok).toBe(true);

    bus.undo();
    expect(files()).toEqual(before);
  });

  it('refuses to remove the page that opens first, and a page that does not exist', () => {
    const { state, bus, files, refused } = studio();
    const before = files();
    const error = refused(pageRemove({ pageId: state().initialPageId }));
    expect(error.code).toBe('REFERENCE_BLOCKED');
    const ghost = pageAdd({ key: 'g', route: '/g', title: 'g' }).payload.pageId;
    expect(refused(pageRemove({ pageId: ghost })).details).toEqual({ field: 'pageId' });
    expect(files()).toEqual(before);
    expect(bus.history.getState().undo).toEqual([]);
  });
});

describe('CMD-PAGE-MOVE', () => {
  it('moves a page, and its route goes with it', () => {
    const { state, add, run } = studio();
    const home = state().initialPageId;
    const a = add('a');
    const b = add('b');
    run(pageMove({ pageId: b, toIndex: 0 }));
    expect(state().pages.order).toEqual([b, home, a]);
    expect(state().routes.map((entry) => entry.pageId)).toEqual([b, home, a]);
    run(pageMove({ pageId: b, toIndex: 2 }));
    expect(state().pages.order).toEqual([home, a, b]);
  });

  it('is not a change to put a page where it is', () => {
    const { state, run } = studio();
    expect(run(pageMove({ pageId: state().initialPageId, toIndex: 0 }))).toBe(false);
  });

  it.each([-1, 2, 0.5, Number.NaN])('refuses the place %s among two pages', (toIndex) => {
    const { state, add, refused } = studio();
    add('a');
    expect(refused(pageMove({ pageId: state().initialPageId, toIndex })).details).toEqual({
      field: 'toIndex',
    });
  });

  it('refuses a page that does not exist', () => {
    const { refused } = studio();
    const ghost = pageAdd({ key: 'g', route: '/g', title: 'g' }).payload.pageId;
    expect(refused(pageMove({ pageId: ghost, toIndex: 0 })).details).toEqual({ field: 'pageId' });
  });
});

describe('200 modifications (EF-UI-06, critère de sortie du lot 5)', () => {
  it('undoes all of them, then redoes all of them, to the same files', () => {
    const { bus, files, state, run, add } = studio();
    const initial = files();
    const ids: Id<'page'>[] = [];
    for (let i = 0; i < 200; i += 1) {
      if (i % 4 === 0 || ids.length < 3) ids.push(add(`page${i}`));
      else if (i % 4 === 1)
        run(pageRename({ pageId: ids[i % ids.length] as Id<'page'>, key: `renamed${i}` }));
      else if (i % 4 === 2)
        run(
          pageMove({
            pageId: ids[i % ids.length] as Id<'page'>,
            toIndex: i % state().pages.order.length,
          }),
        );
      else
        run(pageRename({ pageId: ids[(i * 7) % ids.length] as Id<'page'>, route: `/moved${i}` }));
    }
    expect(bus.history.getState().undo).toHaveLength(200);
    const final = files();
    expect(final).not.toEqual(initial);
    while (bus.undo());
    expect(files()).toEqual(initial);
    while (bus.redo());
    expect(files()).toEqual(final);
  });
});

const ops = fc.array(
  fc.oneof(
    fc.constant({ kind: 'add' } as const),
    fc.record({ kind: fc.constant('rename' as const), at: fc.nat(30), route: fc.boolean() }),
    fc.record({ kind: fc.constant('remove' as const), at: fc.nat(30) }),
    fc.record({ kind: fc.constant('move' as const), at: fc.nat(30), to: fc.nat(30) }),
  ),
  { maxLength: 40 },
);

describe('whatever the commands, the project stays a package that can be saved and read back', () => {
  it('property: the state is the one its files give back, valid, and undo then redo are exact', () => {
    fc.assert(
      fc.property(ops, (sequence) => {
        const { bus, state, files, run } = studio();
        const initial = files();
        let counter = 0;
        for (const op of sequence) {
          const order = state().pages.order;
          const target = order[op.kind === 'add' ? 0 : op.at % order.length] as Id<'page'>;
          counter += 1;
          if (op.kind === 'add') {
            run(pageAdd({ key: `p${counter}`, route: `/p${counter}`, title: `P${counter}` }));
          } else if (op.kind === 'rename') {
            run(
              pageRename(
                op.route
                  ? { pageId: target, route: `/r${counter}` }
                  : { pageId: target, key: `k${counter}` },
              ),
            );
          } else if (op.kind === 'remove') {
            if (target !== state().initialPageId) run(pageRemove({ pageId: target }));
          } else {
            run(pageMove({ pageId: target, toIndex: op.to % order.length }));
          }
        }
        const final = files();
        expect(validateFiles(final).ok).toBe(true);
        const reread = fromFiles(final);
        expect(reread.ok && reread.value).toEqual(state());
        while (bus.undo());
        expect(files()).toEqual(initial);
        while (bus.redo());
        expect(files()).toEqual(final);
      }),
      { numRuns: 60 },
    );
  });
});
