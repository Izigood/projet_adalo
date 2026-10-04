import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { App } from '../src/app.js';
import type { ServicesSource, StudioServices } from '../src/services.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * What the tests of the screens share: a browser of their own, the Studio rendered on it, and the
 * ways to act and to wait that React asks for. Not part of the Studio: nothing imports it but tests.
 */
export const browser = (extra: Partial<ServicesSource> = {}): ServicesSource => ({
  indexedDB: new IDBFactory(),
  IDBKeyRange,
  ...extra,
});

const mounted: { root: Root; container: HTMLElement }[] = [];

export async function renderStudio(services: StudioServices): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(<App services={services} />));
  // A catalogue that is shown reads its list: wait for it, so that its answer lands inside an act.
  await settle(() => {
    if (container.querySelector('[aria-busy="true"]') !== null) throw new Error('still reading');
  });
  return container;
}

export async function unmountAll(): Promise<void> {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
}

/**
 * Waits until `check` stops throwing. React renders when an act scope ends, not inside it, so this
 * waits in small scopes and looks between them: what runs on IndexedDB has time to finish, and the
 * updates it causes are inside an act, as React wants.
 */
export async function settle(check: () => void, attempts = 200): Promise<void> {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    try {
      check();
      return;
    } catch (error) {
      last = error;
    }
  }
  throw last;
}

export async function click(target: HTMLElement, until?: () => void): Promise<void> {
  await act(async () => void target.click());
  if (until !== undefined) await settle(until);
}

/** Types into a field that React controls: the value goes through the setter React listens to. */
export async function typeInto(
  field: HTMLInputElement | HTMLSelectElement,
  value: string,
): Promise<void> {
  const prototype = field instanceof HTMLSelectElement ? HTMLSelectElement : HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(prototype.prototype, 'value')?.set;
  if (setter === undefined) throw new Error('no value setter');
  await act(async () => {
    setter.call(field, value);
    field.dispatchEvent(
      new Event(field instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }),
    );
  });
}

export function button(container: HTMLElement, name: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.getAttribute('aria-label') === name || candidate.textContent === name,
  );
  if (found === undefined) throw new Error(`no button « ${name} »`);
  return found;
}

/** The control a label names, through its `for`: what a screen reader would announce. */
export function field<T extends HTMLElement>(container: HTMLElement, label: string): T {
  const named = [...container.querySelectorAll('label')].find((item) => item.textContent === label);
  const target = named === undefined ? null : container.querySelector(`[id="${named.htmlFor}"]`);
  if (target === null) throw new Error(`no field labelled « ${label} »`);
  return target as T;
}
