import { LitElement } from 'lit';

/**
 * Base of every component of the library. A component has no I/O: the Runtime gives it its `props`
 * (already validated against the schema of its definition) and its children, and it answers with
 * DOM events named `acs-<event>` (ADR-0034). Properties are read through the `props` object so that
 * one assignment updates the whole component.
 */
export abstract class AcsElement<Props extends object> extends LitElement {
  static override properties = { props: { attribute: false } };

  declare props: Props | undefined;

  /** Emits `acs-<name>`, which crosses the shadow boundary. */
  protected emit(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(`acs-${name}`, { detail, bubbles: true, composed: true }));
  }

  /**
   * Mirrors values on the host as attributes, which the styles select on. Attributes are used
   * because a `style` attribute is blocked by the CSP of dossier 8.1; a value of `undefined`
   * removes the attribute.
   */
  protected reflect(attributes: Readonly<Record<string, string | undefined>>): void {
    for (const [name, value] of Object.entries(attributes)) {
      if (value === undefined) this.removeAttribute(name);
      else if (this.getAttribute(name) !== value) this.setAttribute(name, value);
    }
  }
}
