import { html, nothing } from 'lit';
import type { TemplateResult } from 'lit';
import type { Page, UINode } from '@acs/project-schema';
import { t } from '../i18n.js';

/** Turns a node and the templates of its children into markup. It never does any I/O. */
export type NodeRenderer = (node: UINode, children: readonly TemplateResult[]) => TemplateResult;
export type NodeRenderers = Readonly<Record<string, NodeRenderer>>;

/** What went wrong while rendering a node, for whoever wants to log it. */
export type RenderFailure = {
  readonly correlationId: string;
  readonly pageKey: string;
  readonly nodeId: string;
  readonly component: string | undefined;
  readonly error: unknown;
};

/**
 * Provisional renderers (ADR-0033): the component registry arrives in lot 3 and replaces them.
 * Values go through Lit text bindings, so a prop can never become markup.
 */
export const PROVISIONAL_RENDERERS: NodeRenderers = {
  'info.title@1': (node) => {
    const text = node.props['text'];
    return html`<h1 class="acs-title">${typeof text === 'string' ? text : ''}</h1>`;
  },
};

const MAX_DEPTH = 64;

const failureMarker = (message: string, correlationId: string) => html`
  <div class="acs-node-error" role="alert" data-correlation-id=${correlationId}>
    ${message} <small>${t('runtime.reference')} ${correlationId}</small>
  </div>
`;

/**
 * Renders the tree of a page from its root node. Each node is its own error boundary: a renderer
 * that throws, a child that does not exist, a cycle or a tree that is too deep gives a marker in
 * that place and leaves the rest of the page standing. The failure is reported once, with a
 * reference the marker shows, so a user can quote it.
 */
export function renderPage(
  page: Page,
  renderers: NodeRenderers,
  report: (failure: RenderFailure) => void,
): TemplateResult {
  const fail = (nodeId: string, component: string | undefined, error: unknown, message: string) => {
    const correlationId = globalThis.crypto.randomUUID();
    report({ correlationId, pageKey: page.key, nodeId, component, error });
    return failureMarker(message, correlationId);
  };

  const renderNode = (nodeId: string, path: ReadonlySet<string>): TemplateResult => {
    const node = Object.hasOwn(page.nodes, nodeId) ? page.nodes[nodeId] : undefined;
    if (node === undefined) {
      return fail(nodeId, undefined, new Error('node not found'), t('runtime.node.missing'));
    }
    try {
      if (path.has(nodeId) || path.size >= MAX_DEPTH) {
        throw new Error(path.has(nodeId) ? 'cycle in the page tree' : 'page tree too deep');
      }
      const inside = new Set(path).add(nodeId);
      const children = node.children.map((childId) => renderNode(childId, inside));
      const renderer = Object.hasOwn(renderers, node.component)
        ? renderers[node.component]
        : undefined;
      if (renderer === undefined) {
        return html`<div class="acs-unknown" role="note">
          ${t('runtime.node.unknown')}
          <code>${node.component}</code>${children.length > 0 ? children : nothing}
        </div>`;
      }
      return renderer(node, children);
    } catch (error) {
      return fail(nodeId, node.component, error, t('runtime.node.error'));
    }
  };

  return renderNode(page.rootNodeId, new Set());
}
