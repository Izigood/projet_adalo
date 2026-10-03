import { LitElement, css, html, nothing } from 'lit';
import type { TemplateResult } from 'lit';
import { BREAKPOINT_QUERIES, deprecationNotices } from '@acs/component-sdk';
import type { Breakpoint, ComponentRegistry, DeprecationNotice } from '@acs/component-sdk';
import { createBaseRegistry, defineBaseElements } from '@acs/components';
import { applyTheme } from '@acs/design-system';
import type { DomainError, IdentityProvider } from '@acs/domain';
import type { Page } from '@acs/project-schema';
import { boot } from './boot/boot.js';
import type { BootedProject } from './boot/boot.js';
import { httpFileSource } from './boot/file-source.js';
import type { FileSource } from './boot/file-source.js';
import { t } from './i18n.js';
import { evaluateGuards } from './router/guards.js';
import type { GuardDecision } from './router/guards.js';
import { resolveLocation } from './router/match-route.js';
import type { Location } from './router/match-route.js';
import { renderPage } from './ui/render-page.js';
import type { NodeRenderers, RenderFailure } from './ui/render-page.js';
import { renderersFromRegistry } from './ui/registry-renderers.js';

export const RUNTIME_ROOT_TAG = 'acs-runtime-root';

type View =
  | { readonly kind: 'loading' }
  | { readonly kind: 'boot-error'; readonly error: DomainError }
  | { readonly kind: 'page'; readonly page: Page }
  | { readonly kind: 'not-found'; readonly invalidParam: string | undefined }
  | { readonly kind: 'denied'; readonly reason: 'role-missing' | 'expression-unsupported' }
  | { readonly kind: 'crash'; readonly correlationId: string };

type Issue = { file?: string; path?: string; keyword?: string; message?: string };

const issuesOf = (error: DomainError): readonly Issue[] => {
  const issues = (error.details as { issues?: unknown } | undefined)?.issues;
  return Array.isArray(issues) ? (issues as Issue[]) : [];
};

/**
 * Application shell of the Runtime: reads the project (ADR-0033), applies its theme, follows the
 * hash and shows the page, a 404, a refusal or the reason the project cannot start. Whatever
 * happens, something readable is on screen.
 */
export class RuntimeRoot extends LitElement {
  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
      padding: var(--acs-space-5);
      background: var(--acs-color-surface);
      color: var(--acs-color-text);
      font-family: var(--acs-font-family-sans);
      line-height: var(--acs-line-height-normal);
    }
    h1 {
      margin: 0 0 var(--acs-space-2);
      font-size: var(--acs-font-size-xl);
    }
    p,
    dd {
      margin: 0 0 var(--acs-space-2);
      color: var(--acs-color-text-muted);
    }
    a {
      color: var(--acs-color-primary);
    }
    ul {
      padding-left: var(--acs-space-5);
    }
    .acs-node-error,
    .acs-unknown {
      margin: var(--acs-space-2) 0;
      padding: var(--acs-space-3);
      border: 1px solid var(--acs-color-border);
      border-radius: var(--acs-radius-md);
    }
    .acs-node-error {
      border-color: var(--acs-color-danger);
      color: var(--acs-color-danger);
    }
  `;

  /** Where the package files are read from; the folder `./project/` next to the page by default. */
  source: FileSource | undefined;
  /** Builds the identity provider for the locale of the project; the local one by default. */
  identity: ((locale: string) => IdentityProvider) | undefined;
  /** The components the project may use; the base library by default. */
  registry: ComponentRegistry | undefined;
  /**
   * How each component is drawn. Left undefined (the normal case) it is built from the registry
   * and the current breakpoint; a value replaces that, which tests use to inject renderers.
   */
  renderers: NodeRenderers | undefined;
  /** Told about every rendering failure; logs to the console by default. */
  onFailure: (failure: RenderFailure) => void = (failure) => console.error('[acs]', failure);
  /** Told, once at start, about each deprecated component the project uses (EF-CMP-03). */
  onWarning: (notice: DeprecationNotice) => void = (notice) => console.warn('[acs]', notice);

  #view: View = { kind: 'loading' };
  #project: BootedProject | undefined;
  #started: Promise<void> | undefined;
  #breakpoint: Breakpoint = 'desktop';
  #queries: MediaQueryList[] = [];
  readonly #onHashChange = () => this.#navigate();
  readonly #onBreakpointChange = () => this.#updateBreakpoint();

  /** Resolves once the project has been read and the first page is shown (or the error is). */
  get settled(): Promise<void> {
    return this.#started ?? Promise.resolve();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#watchBreakpoint();
    this.#started ??= this.#start();
    this.ownerDocument.defaultView?.addEventListener('hashchange', this.#onHashChange);
  }

  override disconnectedCallback(): void {
    this.ownerDocument.defaultView?.removeEventListener('hashchange', this.#onHashChange);
    for (const query of this.#queries)
      query.removeEventListener('change', this.#onBreakpointChange);
    this.#queries = [];
    super.disconnectedCallback();
  }

  /** Follows the width of the window through media queries that flip at 600 and 1024 px. */
  #watchBreakpoint(): void {
    const view = this.ownerDocument.defaultView;
    if (view === null || typeof view.matchMedia !== 'function' || this.#queries.length > 0) return;
    this.#queries = [
      view.matchMedia(BREAKPOINT_QUERIES.tablet),
      view.matchMedia(BREAKPOINT_QUERIES.desktop),
    ];
    for (const query of this.#queries) query.addEventListener('change', this.#onBreakpointChange);
    this.#updateBreakpoint();
  }

  #updateBreakpoint(): void {
    const [tablet, desktop] = this.#queries;
    const next: Breakpoint =
      desktop?.matches === true ? 'desktop' : tablet?.matches === true ? 'tablet' : 'mobile';
    if (next === this.#breakpoint) return;
    this.#breakpoint = next;
    this.requestUpdate();
  }

  async #start(): Promise<void> {
    try {
      await this.#boot();
    } catch (error) {
      // A bug, not a bad project (boot reports those as errors): still tell the user.
      const correlationId = globalThis.crypto.randomUUID();
      this.onFailure({ correlationId, pageKey: '', nodeId: '', component: undefined, error });
      this.#show({ kind: 'crash', correlationId });
    }
  }

  async #boot(): Promise<void> {
    const doc = this.ownerDocument;
    this.registry ??= createBaseRegistry();
    defineBaseElements();
    const source = this.source ?? httpFileSource(new URL('./project/', doc.baseURI).href);
    const result = await boot(
      this.identity === undefined ? { source } : { source, identity: this.identity },
    );
    if (!result.ok) {
      this.#show({ kind: 'boot-error', error: result.error });
      return;
    }
    this.#project = result.value;
    applyTheme(doc, result.value.theme);
    doc.title = result.value.manifest.project.name;
    this.#warnAboutDeprecations(result.value);
    this.#navigate();
  }

  /** Tells, once, which deprecated components the project uses. */
  #warnAboutDeprecations(project: BootedProject): void {
    const refs = [...project.pages.values()].flatMap((page) =>
      Object.values(page.nodes).map((node) => node.component),
    );
    for (const notice of deprecationNotices(this.registry ?? createBaseRegistry(), refs)) {
      // (the registry is set at the start of #boot; the fallback only satisfies the type)
      this.onWarning(notice);
    }
  }

  #navigate(): void {
    const project = this.#project;
    const view = this.ownerDocument.defaultView;
    if (project === undefined || view === null) return;
    let location: Location = resolveLocation(project.table, view.location.hash);
    if (location.kind === 'redirect') {
      view.history.replaceState(null, '', `#${location.to}`);
      location = resolveLocation(project.table, view.location.hash);
    }
    switch (location.kind) {
      case 'page': {
        const page = project.pages.get(location.route.pageId);
        if (page === undefined) return this.#show({ kind: 'not-found', invalidParam: undefined });
        const decision: GuardDecision = evaluateGuards(page.guards, project.user);
        return this.#show(
          decision.allowed ? { kind: 'page', page } : { kind: 'denied', reason: decision.reason },
        );
      }
      case 'invalid-param':
        return this.#show({ kind: 'not-found', invalidParam: location.param });
      default:
        return this.#show({ kind: 'not-found', invalidParam: undefined });
    }
  }

  #show(view: View): void {
    this.#view = view;
    this.requestUpdate();
  }

  protected override render(): TemplateResult {
    try {
      return this.#renderView(this.#view);
    } catch (error) {
      // The last boundary: whatever broke, the user is told instead of facing a dead page.
      const correlationId = globalThis.crypto.randomUUID();
      this.onFailure({ correlationId, pageKey: '', nodeId: '', component: undefined, error });
      return this.#renderView({ kind: 'crash', correlationId });
    }
  }

  /** The renderers in force: the injected ones, or those of the registry at this breakpoint. */
  #renderers(): NodeRenderers {
    return (
      this.renderers ??
      renderersFromRegistry(this.registry ?? createBaseRegistry(), this.#breakpoint)
    );
  }

  #renderView(view: View): TemplateResult {
    switch (view.kind) {
      case 'loading':
        return html`<p role="status">${t('runtime.loading')}</p>`;
      case 'boot-error':
        return this.#renderBootError(view.error);
      case 'page':
        return html`<main>${renderPage(view.page, this.#renderers(), this.onFailure)}</main>`;
      case 'not-found':
        return html`<main>
          <h1>${t('runtime.notFound.title')}</h1>
          <p>
            ${
              view.invalidParam === undefined
                ? t('runtime.notFound.text')
                : html`${t('runtime.invalidParam.text')} <code>${view.invalidParam}</code>`
            }
          </p>
          <p><a href="#/">${t('runtime.notFound.back')}</a></p>
        </main>`;
      case 'denied':
        return html`<main>
          <h1>${t('runtime.denied.title')}</h1>
          <p>
            ${
              view.reason === 'role-missing'
                ? t('runtime.denied.role')
                : t('runtime.denied.expression')
            }
          </p>
        </main>`;
      case 'crash':
        return html`<main role="alert">
          <h1>${t('runtime.crash.title')}</h1>
          <p>${t('runtime.crash.text')} ${t('runtime.reference')} ${view.correlationId}</p>
        </main>`;
    }
  }

  #renderBootError(error: DomainError): TemplateResult {
    const issues = issuesOf(error);
    return html`<main role="alert">
      <h1>${t('runtime.bootError.title')}</h1>
      <p>${t('runtime.bootError.intro')}</p>
      <dl>
        <dt>${t('runtime.bootError.code')}</dt>
        <dd>${error.code}</dd>
        <dt>${t('runtime.reference')}</dt>
        <dd>${error.correlationId}</dd>
      </dl>
      ${
        issues.length === 0
          ? nothing
          : html`<h2>${t('runtime.bootError.issues')}</h2>
              <ul>
                ${issues.map(
                  (issue) =>
                    html`<li>
                      <code>${issue.file ?? ''} ${issue.path ?? ''}</code>
                      ${issue.message ?? issue.keyword ?? ''}
                    </li>`,
                )}
              </ul>`
      }
    </main>`;
  }
}

if (!customElements.get(RUNTIME_ROOT_TAG)) {
  customElements.define(RUNTIME_ROOT_TAG, RuntimeRoot);
}

declare global {
  interface HTMLElementTagNameMap {
    [RUNTIME_ROOT_TAG]: RuntimeRoot;
  }
}
