import { domainError } from '@acs/domain';
import { describe, expect, it } from 'vitest';
import fr from '../locales/fr.json';
import { createProject } from '../project/create-project.js';
import { toFiles } from '../project/project-state.js';
import type { ProjectState } from '../project/project-state.js';
import { createProjectStore } from '../project/project-store.js';
import { createCommandBus } from './bus.js';
import type { StudioEvent } from './command.js';
import { projectUpdate } from './project-commands.js';

function demo(): ProjectState {
  const result = createProject({ key: 'DEMO', name: 'Demo' });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function opened(limit?: number) {
  const store = createProjectStore();
  const bus = createCommandBus(store, limit === undefined ? {} : { limit });
  bus.load(demo());
  const name = () => store.view.getState()?.project.name;
  const rename = (to: string) => bus.execute(projectUpdate({ name: to }));
  return { store, bus, name, rename };
}

describe('the command bus (ARC-STU-02, EF-UI-06)', () => {
  it('applies a command to the open project, and reads in the history under its label', () => {
    const { bus, name, rename } = opened();
    expect(rename('Premier')).toEqual({ ok: true, value: { changed: true } });
    expect(name()).toBe('Premier');
    expect(bus.history.getState()).toEqual({
      undo: [fr['command.projectUpdate']],
      redo: [],
    });
  });

  it('undoes and redoes by patches, back to the very same files', () => {
    const { store, bus, rename } = opened();
    const files = (): unknown => {
      const state = store.view.getState();
      return state === null ? null : toFiles(state);
    };
    const before = structuredClone(files());
    rename('Un');
    rename('Deux');
    const after = structuredClone(files());
    expect(bus.undo()).toBe(true);
    expect(bus.undo()).toBe(true);
    expect(files()).toEqual(before);
    expect(bus.history.getState()).toMatchObject({
      undo: [],
      redo: [expect.anything(), expect.anything()],
    });
    expect(bus.redo()).toBe(true);
    expect(bus.redo()).toBe(true);
    expect(files()).toEqual(after);
  });

  it('has nothing to undo or redo when there is nothing', () => {
    const { bus } = opened();
    expect(bus.undo()).toBe(false);
    expect(bus.redo()).toBe(false);
  });

  it('forgets what could be redone when a new command comes', () => {
    const { bus, name, rename } = opened();
    rename('Un');
    rename('Deux');
    bus.undo();
    expect(bus.history.getState().redo).toHaveLength(1);
    rename('Trois');
    expect(bus.history.getState().redo).toEqual([]);
    expect(bus.redo()).toBe(false);
    expect(name()).toBe('Trois');
  });

  it('keeps nothing of a command that changes nothing', () => {
    const { bus, rename } = opened();
    rename('Un');
    const events: StudioEvent[] = [];
    bus.listen((event) => events.push(event));
    expect(rename('Un')).toEqual({ ok: true, value: { changed: false } });
    expect(bus.history.getState().undo).toHaveLength(1);
    expect(events).toEqual([]);
  });

  it('keeps only the last commands up to the limit, and undoes exactly those', () => {
    const { bus, name, rename } = opened(3);
    for (const to of ['A', 'B', 'C', 'D', 'E']) rename(to);
    expect(bus.history.getState().undo).toHaveLength(3);
    expect([bus.undo(), bus.undo(), bus.undo(), bus.undo()]).toEqual([true, true, true, false]);
    expect(name()).toBe('B');
  });

  it('keeps 200 commands and more by default', () => {
    const { bus, name, rename } = opened();
    for (let i = 1; i <= 200; i += 1) rename(`Nom ${i}`);
    for (let i = 0; i < 200; i += 1) expect(bus.undo()).toBe(true);
    expect(name()).toBe('Demo');
  });

  it('tells what listens, after the change and the history are complete', () => {
    const { store, bus, rename } = opened();
    const seen: { event: StudioEvent; name: string | undefined; undo: number }[] = [];
    const stop = bus.listen((event) =>
      seen.push({
        event,
        name: store.view.getState()?.project.name,
        undo: bus.history.getState().undo.length,
      }),
    );
    rename('Un');
    bus.undo();
    bus.redo();
    stop();
    rename('Deux');
    expect(seen.map((entry) => [entry.event.cause, entry.name, entry.undo])).toEqual([
      ['command', 'Un', 1],
      ['undo', 'Demo', 0],
      ['redo', 'Un', 1],
    ]);
    expect(seen[0]?.event.label).toBe(fr['command.projectUpdate']);
  });

  it('refuses a command that fails, and keeps nothing of what it began', () => {
    const store = createProjectStore();
    const bus = createCommandBus(store, {
      commands: {
        'CMD-TEST-FAIL': (draft) => {
          draft.project.name = 'Half done';
          return domainError('CONSTRAINT_VIOLATION', 'no');
        },
      },
    });
    bus.load(demo());
    const events: StudioEvent[] = [];
    bus.listen((event) => events.push(event));
    const result = bus.execute({ type: 'CMD-TEST-FAIL', payload: null, label: 'Test' });
    expect(result.ok).toBe(false);
    expect(store.view.getState()?.project.name).toBe('Demo');
    expect(bus.history.getState().undo).toEqual([]);
    expect(events).toEqual([]);
  });

  it('does not touch the project a command was applied to', () => {
    const { store, rename } = opened();
    const before = store.view.getState();
    const snapshot = structuredClone(before);
    rename('Un');
    expect(before).toEqual(snapshot);
    expect(store.view.getState()).not.toBe(before);
  });

  it('forgets the history when another project is loaded or the project is closed', () => {
    const { store, bus, rename } = opened();
    const events: StudioEvent[] = [];
    bus.listen((event) => events.push(event));
    rename('Un');
    bus.load(demo());
    expect(bus.history.getState()).toEqual({ undo: [], redo: [] });
    expect(bus.undo()).toBe(false);
    rename('Deux');
    bus.close();
    expect(store.view.getState()).toBeNull();
    expect(bus.history.getState()).toEqual({ undo: [], redo: [] });
    expect(events.map((event) => event.cause)).toEqual(['command', 'loaded', 'command', 'closed']);
  });

  it('refuses to run with no project open, and a command it does not know', () => {
    const store = createProjectStore();
    const bus = createCommandBus(store);
    expect(() => bus.execute(projectUpdate({ name: 'X' }))).toThrow('no project is open');
    bus.load(demo());
    expect(() => bus.execute({ type: 'CMD-NOPE', payload: null, label: 'x' })).toThrow(
      'unknown command CMD-NOPE',
    );
  });
});

describe('the project update (CMD-PROJECT-UPDATE)', () => {
  it('changes the metadata that is given, and only that', () => {
    const { store, bus } = opened();
    bus.execute(projectUpdate({ description: 'Une description', author: 'Ada', version: '0.2.0' }));
    expect(store.view.getState()?.project).toMatchObject({
      key: 'DEMO',
      name: 'Demo',
      description: 'Une description',
      author: 'Ada',
      version: '0.2.0',
      locale: 'fr-FR',
    });
  });
});
