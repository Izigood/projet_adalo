import { act, useLayoutEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { typeInto } from '../../test-kit/ui.js';
import { CommitField } from './commit-field.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];
afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(async () => root.unmount());
    container.remove();
  }
});

/**
 * What the input holds at the end of each commit of the page: a screen that follows its value in
 * an effect shows the old one in a commit of its own, which the person (or a fast typist) can meet.
 */
function Probe(props: { value: string; seen: string[]; commit(next: string): string | null }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    props.seen.push(host.current?.querySelector('input')?.value ?? '');
  });
  return (
    <div ref={host}>
      <CommitField label="Clé" value={props.value} commit={props.commit} />
    </div>
  );
}

async function render(value: string, seen: string[], commit: (next: string) => string | null) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(<Probe value={value} seen={seen} commit={commit} />));
  return {
    container,
    again: (next: string) =>
      act(async () => root.render(<Probe value={next} seen={seen} commit={commit} />)),
  };
}

describe('a field of the inspector, when the value it shows changes', () => {
  it('shows the new value in the very commit in which it arrives, never the old one again', async () => {
    const seen: string[] = [];
    const { again } = await render('page-a', seen, () => null);
    await again('page-b');
    await again('page-c');
    expect(seen).toEqual(['page-a', 'page-b', 'page-c']);
  });

  it('gives way to the new value over what was being typed, and takes back the message of the old one', async () => {
    const seen: string[] = [];
    const { container, again } = await render('page-a', seen, () => 'refusé');
    const input = container.querySelector('input') as HTMLInputElement;
    await act(async () => input.focus());
    await typeInto(input, 'autre');
    await act(async () => input.blur());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('refusé');
    expect(input.value).toBe('page-a');

    await typeInto(input, 'en cours');
    await again('page-b');
    expect(input.value).toBe('page-b');
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not touch what is being typed when the value is the same again', async () => {
    const seen: string[] = [];
    const { container, again } = await render('page-a', seen, () => null);
    const input = container.querySelector('input') as HTMLInputElement;
    await typeInto(input, 'en cours');
    await again('page-a');
    expect(input.value).toBe('en cours');
  });
});
