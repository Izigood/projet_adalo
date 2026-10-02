import type { AcsElement } from './base/acs-element.js';

/** Puts a component in the document with the given props and children, and waits for its render. */
export async function mount<Props extends object>(
  tag: string,
  props: Props | undefined,
  children: readonly HTMLElement[] = [],
): Promise<AcsElement<Props>> {
  const element = document.createElement(tag) as AcsElement<Props>;
  element.props = props;
  element.append(...children);
  document.body.append(element);
  await element.updateComplete;
  return element;
}

export const child = (tag: string, text = ''): HTMLElement => {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
};
