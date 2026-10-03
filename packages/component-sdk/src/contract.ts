import type { ComponentDefinition } from './definition.js';
import { sampleProps, validateProps } from './props.js';
import { INTERACTIVE_ROLES, definitionIssues } from './validate-definition.js';

export type ContractFindingCode =
  | 'definition'
  | 'sample-invalid'
  | 'element-not-defined'
  | 'render-failed'
  | 'role-missing'
  | 'name-missing'
  | 'name-mismatch'
  | 'not-focusable'
  | 'inline-style'
  | 'inline-handler';

export type ContractFinding = { readonly code: ContractFindingCode; readonly message: string };

/** Roles whose accessible name comes from their content: an empty one has no name. */
const NAMED_BY_CONTENT = new Set(['button', 'link', 'heading', 'tab', 'menuitem', 'option']);

const NATIVE_ROLES: Readonly<Record<string, string>> = {
  button: 'button',
  nav: 'navigation',
  ul: 'list',
  ol: 'list',
  li: 'listitem',
  progress: 'progressbar',
  meter: 'meter',
  main: 'main',
  aside: 'complementary',
  header: 'banner',
  footer: 'contentinfo',
  dialog: 'dialog',
  form: 'form',
  img: 'img',
  p: 'paragraph',
  table: 'table',
  hr: 'separator',
  output: 'status',
  textarea: 'textbox',
  fieldset: 'group',
  article: 'article',
  summary: 'button',
};

function implicitRole(element: Element): string | undefined {
  const name = element.localName;
  if (/^h[1-6]$/.test(name)) return 'heading';
  if (name === 'a') return element.hasAttribute('href') ? 'link' : undefined;
  if (name === 'section') {
    return element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby')
      ? 'region'
      : undefined;
  }
  return NATIVE_ROLES[name];
}

const NATIVELY_FOCUSABLE = new Set(['button', 'input', 'select', 'textarea', 'summary']);

function isFocusable(element: Element): boolean {
  const tabindex = element.getAttribute('tabindex');
  if (tabindex !== null) return Number(tabindex) >= 0;
  if (element.localName === 'a') return element.hasAttribute('href');
  return NATIVELY_FOCUSABLE.has(element.localName) && !element.hasAttribute('disabled');
}

/** The element and everything under it, shadow trees included. */
function* descendants(element: Element): Generator<Element> {
  yield element;
  for (const child of element.shadowRoot?.children ?? []) yield* descendants(child);
  for (const child of element.children) yield* descendants(child);
}

function textOf(element: Element): string {
  const own = (element.shadowRoot?.textContent ?? '') + (element.textContent ?? '');
  return own.replace(/\s+/g, ' ').trim();
}

function accessibleName(element: Element): string {
  const label = element.getAttribute('aria-label');
  if (label !== null && label.trim() !== '') return label.trim();
  const labelledBy = element.getAttribute('aria-labelledby');
  const root = element.getRootNode() as Document | ShadowRoot;
  const target = labelledBy === null ? null : root.getElementById?.(labelledBy);
  return target ? textOf(target) : textOf(element);
}

/**
 * The generic contract test of a component (EF-CMP-01): the definition is valid, and the element
 * that really renders honours what the definition says (the role is there, the accessible name is
 * the one declared, interactive components can take focus, nothing breaks the CSP of dossier 8.1).
 * Returns every finding; an empty list is a pass. It renders into `doc` and cleans up after itself.
 *
 * What it does not do: it presses no key. `accessibility.keyboard` is checked as declared (and
 * non-empty for an interactive role), not as working; the keyboard behaviour of each component is
 * proved by that component's own tests and by the interaction E2E suite (ADR-0034).
 */
export async function contractFindings(
  definition: ComponentDefinition,
  doc: Document = document,
): Promise<ContractFinding[]> {
  const findings: ContractFinding[] = [];
  const add = (code: ContractFindingCode, message: string) => findings.push({ code, message });

  for (const issue of definitionIssues(definition))
    add('definition', `${issue.path}: ${issue.message}`);

  const props = sampleProps(definition.propsSchema);
  if (!validateProps(definition, props).ok) {
    add('sample-invalid', 'the required props cannot be filled in: give the hard ones a default');
  }

  if (doc.defaultView?.customElements.get(definition.tag) === undefined) {
    add('element-not-defined', `no custom element is defined for <${definition.tag}>`);
    return findings;
  }

  const host = doc.createElement(definition.tag) as HTMLElement & {
    props?: unknown;
    updateComplete?: Promise<unknown>;
  };
  try {
    host.props = props;
    doc.body.append(host);
    await host.updateComplete;
  } catch (error) {
    add('render-failed', `rendering with sample props threw: ${String(error)}`);
    host.remove();
    return findings;
  }

  try {
    const all = [...descendants(host)];
    for (const element of all) {
      if (element.hasAttribute('style')) {
        add('inline-style', `<${element.localName}> has a style attribute (blocked by the CSP)`);
      }
      for (const attribute of element.getAttributeNames()) {
        if (attribute.startsWith('on')) {
          add('inline-handler', `<${element.localName}> has an inline handler: ${attribute}`);
        }
      }
    }

    const { role, nameFrom } = definition.accessibility;
    const bearer = all.find(
      (element) => (element.getAttribute('role') ?? implicitRole(element)) === role,
    );
    if (bearer === undefined) {
      add('role-missing', `the rendered element has no element with the role ${role}`);
    } else {
      if (nameFrom.startsWith('prop:')) {
        const expected = String(props[nameFrom.slice('prop:'.length)] ?? '');
        if (!accessibleName(bearer).includes(expected)) {
          add('name-mismatch', `the accessible name does not carry the prop ${nameFrom.slice(5)}`);
        }
      } else if (NAMED_BY_CONTENT.has(role) && accessibleName(bearer) === '') {
        add('name-missing', `the ${role} has no accessible name`);
      }
      if (INTERACTIVE_ROLES.has(role) && ![...descendants(bearer)].some(isFocusable)) {
        add('not-focusable', `the ${role} cannot take keyboard focus`);
      }
    }
  } finally {
    host.remove();
  }
  return findings;
}
