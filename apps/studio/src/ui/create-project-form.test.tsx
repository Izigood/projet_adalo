import { domainError, err } from '@acs/domain';
import type { DomainError } from '@acs/domain';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  browser,
  button,
  click,
  field,
  renderStudio,
  settle,
  unmountAll,
} from '../../test-kit/ui.js';
import fr from '../locales/fr.json';
import { createStudioServices } from '../services.js';
import { fieldErrorsOf } from './create-project-form.js';

afterEach(unmountAll);

/** Fills the fields the test names, as a person who types in them would (the fields are not controlled). */
function fill(container: HTMLElement, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    field<HTMLInputElement | HTMLTextAreaElement>(container, label).value = value;
  }
}

const alerts = (container: HTMLElement) =>
  [...container.querySelectorAll('.create-project [role="alert"]')].map(
    (alert) => alert.textContent,
  );

const submit = (container: HTMLElement, until?: () => void) =>
  click(button(container, fr['create.submit']), until);

describe('the form that creates a project (EF-PRJ-01)', () => {
  it('has a field for each piece of information, each named, and says what a key looks like', async () => {
    const container = await renderStudio(createStudioServices(browser()));
    for (const label of [
      'create.key',
      'create.name',
      'create.description',
      'create.author',
    ] as const) {
      expect(field(container, fr[label])).toBeTruthy();
    }
    const key = field<HTMLInputElement>(container, fr['create.key']);
    const hint = container.querySelector(`[id="${key.getAttribute('aria-describedby')}"]`);
    expect(hint?.textContent).toBe(fr['create.keyHint']);
    expect(key.maxLength).toBe(16);
    expect(field<HTMLInputElement>(container, fr['create.name']).maxLength).toBe(200);
    expect(field<HTMLTextAreaElement>(container, fr['create.description']).maxLength).toBe(2000);
    expect(field<HTMLInputElement>(container, fr['create.author']).maxLength).toBe(200);
    expect(container.querySelector('form')?.getAttribute('aria-labelledby')).toBe(
      container.querySelector('form h3')?.id,
    );
    expect(alerts(container)).toEqual([]);
    expect(key.getAttribute('aria-invalid')).toBe('false');
  });

  it('creates the project with what was typed, and opens it', async () => {
    const services = createStudioServices(browser());
    const container = await renderStudio(services);
    fill(container, {
      [fr['create.key']]: 'DEMO',
      [fr['create.name']]: 'Mon appli',
      [fr['create.description']]: 'Un essai',
      [fr['create.author']]: 'Ada',
    });
    await submit(container, () =>
      expect(container.querySelector('.project-name')?.textContent).toBe('Mon appli'),
    );
    expect(container.querySelector('.catalog')).toBeNull();
    const id = services.session.current();
    const stored = id === null ? null : await services.store.load(id);
    expect(stored?.ok && stored.value?.entry).toMatchObject({
      key: 'DEMO',
      name: 'Mon appli',
      description: 'Un essai',
      author: 'Ada',
      status: 'active',
    });
  });

  it('takes away the spaces around what was typed', async () => {
    const services = createStudioServices(browser());
    const container = await renderStudio(services);
    fill(container, { [fr['create.key']]: '  DEMO ', [fr['create.name']]: '  Mon appli  ' });
    await submit(container, () => expect(services.session.current()).not.toBeNull());
    expect(services.project.view.getState()?.project).toMatchObject({
      key: 'DEMO',
      name: 'Mon appli',
    });
  });

  it('empties the form once the project is created: the next time it is blank', async () => {
    const services = createStudioServices(browser());
    const container = await renderStudio(services);
    const key = field<HTMLInputElement>(container, fr['create.key']);
    fill(container, { [fr['create.key']]: 'DEMO', [fr['create.name']]: 'Demo' });
    await submit(container, () => expect(services.session.current()).not.toBeNull());
    expect(key.value).toBe('');
    await act(async () => services.session.close());
    await settle(() => expect(container.querySelector('.create-project')).not.toBeNull());
    expect(field<HTMLInputElement>(container, fr['create.key']).value).toBe('');
    expect(field<HTMLInputElement>(container, fr['create.name']).value).toBe('');
  });
});

describe('when the project cannot be created', () => {
  it('says that the key is wrong, marks the field, sends the focus there, and creates nothing', async () => {
    const services = createStudioServices(browser());
    const container = await renderStudio(services);
    fill(container, { [fr['create.key']]: 'demo', [fr['create.name']]: 'Demo' });
    await submit(container, () => expect(alerts(container)).toEqual([fr['create.error.key']]));

    const key = field<HTMLInputElement>(container, fr['create.key']);
    expect(key.getAttribute('aria-invalid')).toBe('true');
    const described = (key.getAttribute('aria-describedby') ?? '').split(' ');
    expect(described).toHaveLength(2);
    expect(container.querySelector(`[id="${described[1]}"]`)?.textContent).toBe(
      fr['create.error.key'],
    );
    expect(document.activeElement).toBe(key);
    expect(services.session.current()).toBeNull();
    const all = await services.store.list();
    expect(all.ok && all.value).toEqual([]);
  });

  it('says that the name is missing, and sends the focus to it', async () => {
    const container = await renderStudio(createStudioServices(browser()));
    fill(container, { [fr['create.key']]: 'DEMO', [fr['create.name']]: '   ' });
    await submit(container, () => expect(alerts(container)).toEqual([fr['create.error.name']]));
    const name = field<HTMLInputElement>(container, fr['create.name']);
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(name);
    expect(field<HTMLInputElement>(container, fr['create.key']).getAttribute('aria-invalid')).toBe(
      'false',
    );
  });

  it('says both when both are wrong, and the focus goes to the first', async () => {
    const container = await renderStudio(createStudioServices(browser()));
    fill(container, { [fr['create.key']]: 'x', [fr['create.name']]: '' });
    await submit(container, () =>
      expect(alerts(container)).toEqual([fr['create.error.key'], fr['create.error.name']]),
    );
    expect(document.activeElement).toBe(field(container, fr['create.key']));
  });

  it('says that the key is taken, on the key, and keeps the project that has it', async () => {
    const services = createStudioServices(browser());
    await services.session.create({ key: 'DEMO', name: 'Premier' });
    await services.session.close();
    const container = await renderStudio(services);
    fill(container, { [fr['create.key']]: 'DEMO', [fr['create.name']]: 'Second' });
    await submit(container, () => expect(alerts(container)).toEqual([fr['error.keyTaken']]));
    expect(document.activeElement).toBe(field(container, fr['create.key']));
    const all = await services.store.list();
    expect(all.ok && all.value.map((entry) => entry.name)).toEqual(['Premier']);
  });

  it('says that the storage failed, in a message of its own', async () => {
    const services = createStudioServices(browser());
    services.session.create = () =>
      Promise.resolve(err(domainError('STORAGE_UNAVAILABLE', 'disk')));
    const container = await renderStudio(services);
    fill(container, { [fr['create.key']]: 'DEMO', [fr['create.name']]: 'Demo' });
    await submit(container, () => expect(alerts(container)).toEqual([fr['error.storage']]));
    expect(field<HTMLInputElement>(container, fr['create.key']).getAttribute('aria-invalid')).toBe(
      'false',
    );
  });

  it('stops saying it once the project is created', async () => {
    const services = createStudioServices(browser());
    const container = await renderStudio(services);
    fill(container, { [fr['create.key']]: 'demo', [fr['create.name']]: 'Demo' });
    await submit(container, () => expect(alerts(container)).toHaveLength(1));
    fill(container, { [fr['create.key']]: 'DEMO' });
    await submit(container, () => expect(services.session.current()).not.toBeNull());
    expect(container.querySelector('.create-project')).toBeNull();
  });

  it('keeps what was typed when it fails, so that nothing has to be typed again', async () => {
    const container = await renderStudio(createStudioServices(browser()));
    fill(container, {
      [fr['create.key']]: 'demo',
      [fr['create.name']]: 'Mon appli',
      [fr['create.author']]: 'Ada',
    });
    await submit(container, () => expect(alerts(container)).toHaveLength(1));
    expect(field<HTMLInputElement>(container, fr['create.key']).value).toBe('demo');
    expect(field<HTMLInputElement>(container, fr['create.name']).value).toBe('Mon appli');
    expect(field<HTMLInputElement>(container, fr['create.author']).value).toBe('Ada');
  });
});

describe('while the project is being created', () => {
  it('cannot be asked for twice: the button waits, and the second press does nothing', async () => {
    const services = createStudioServices(browser());
    const create = services.session.create;
    let calls = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    services.session.create = async (input) => {
      calls += 1;
      await gate;
      return create(input);
    };
    const container = await renderStudio(services);
    fill(container, { [fr['create.key']]: 'DEMO', [fr['create.name']]: 'Demo' });
    const submitButton = button(container, fr['create.submit']);
    await act(async () => void submitButton.click());
    expect(submitButton.disabled).toBe(true);
    const form = container.querySelector('form');
    await act(
      async () =>
        void form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    expect(calls).toBe(1);

    await act(async () => release());
    await settle(() => expect(services.session.current()).not.toBeNull());
    expect(calls).toBe(1);
    const all = await services.store.list();
    expect(all.ok && all.value).toHaveLength(1);
  });

  it('can be asked for again after a refusal', async () => {
    const services = createStudioServices(browser());
    const container = await renderStudio(services);
    fill(container, { [fr['create.key']]: 'demo', [fr['create.name']]: 'Demo' });
    await submit(container, () => expect(alerts(container)).toHaveLength(1));
    expect(button(container, fr['create.submit']).disabled).toBe(false);
  });
});

describe('what is said of an error', () => {
  const manifest = (...paths: string[]): DomainError =>
    domainError('MANIFEST_INVALID', 'x', {
      details: { issues: paths.map((path) => ({ file: 'project.json', path })) },
    });

  it('names the field that the schemas found wrong', () => {
    expect(fieldErrorsOf(manifest('/project/key'))).toEqual({ key: fr['create.error.key'] });
    expect(fieldErrorsOf(manifest('/project/name'))).toEqual({ name: fr['create.error.name'] });
    expect(fieldErrorsOf(manifest('/project/name', '/project/key'))).toEqual({
      key: fr['create.error.key'],
      name: fr['create.error.name'],
    });
  });

  it('says it in general when no field of the form is to blame, or when it cannot tell', () => {
    expect(fieldErrorsOf(manifest('/project/locale'))).toEqual({
      general: fr['create.error.invalid'],
    });
    expect(fieldErrorsOf(manifest())).toEqual({ general: fr['create.error.invalid'] });
    expect(fieldErrorsOf(domainError('MANIFEST_INVALID', 'x'))).toEqual({
      general: fr['create.error.invalid'],
    });
    expect(
      fieldErrorsOf(domainError('MANIFEST_INVALID', 'x', { details: { issues: [null, 3, {}] } })),
    ).toEqual({ general: fr['create.error.invalid'] });
  });

  it('puts a key that is taken on the key, and anything else in general', () => {
    expect(
      fieldErrorsOf(domainError('CONSTRAINT_VIOLATION', 'x', { details: { field: 'key' } })),
    ).toEqual({ key: fr['error.keyTaken'] });
    // A constraint that is not about the key is not « key already taken ».
    expect(
      fieldErrorsOf(domainError('CONSTRAINT_VIOLATION', 'x', { details: { field: 'id' } })),
    ).toEqual({ general: fr['error.generic'] });
    expect(fieldErrorsOf(domainError('CONSTRAINT_VIOLATION', 'x'))).toEqual({
      general: fr['error.generic'],
    });
    expect(fieldErrorsOf(domainError('STORAGE_QUOTA', 'x'))).toEqual({
      general: fr['error.storage'],
    });
    expect(fieldErrorsOf(domainError('VERSION_CONFLICT', 'x'))).toEqual({
      general: fr['error.generic'],
    });
  });
});
