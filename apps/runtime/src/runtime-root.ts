import { LitElement, css, html } from 'lit';
import { t } from './i18n.js';

export const RUNTIME_ROOT_TAG = 'acs-runtime-root';

/** Application shell of the Runtime. Skeleton: the boot pipeline arrives in lot 2. */
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
    p {
      margin: 0;
      color: var(--acs-color-text-muted);
    }
  `;

  protected override render() {
    return html`
      <main>
        <h1>${t('runtime.title')}</h1>
        <p>${t('runtime.subtitle')}</p>
      </main>
    `;
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
