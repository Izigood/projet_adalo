import type { DomainError, Id } from '@acs/domain';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { pageAdd, pageMove, pageRemove } from '../commands/page-commands.js';
import { t } from '../i18n.js';
import type { ProjectState } from '../project/project-state.js';
import { useServices } from './services-context.js';

/** What to tell about a page that could not be added: the field that clashes, or just that it failed. */
export function pageAddMessage(error: DomainError): string {
  const field = error.details?.['field'];
  if (error.code === 'CONSTRAINT_VIOLATION' && field === 'key') return t('pages.error.keyTaken');
  if (error.code === 'CONSTRAINT_VIOLATION' && field === 'route')
    return t('pages.error.routeTaken');
  return t('pages.error.generic');
}

/** Which field of the form a refusal is about, if any: it is marked, and it takes the focus. */
export function pageAddField(error: DomainError): 'key' | 'route' | undefined {
  const field = error.details?.['field'];
  if (error.code !== 'CONSTRAINT_VIOLATION') return undefined;
  return field === 'key' || field === 'route' ? field : undefined;
}

type Failure = { readonly message: string; readonly field?: 'key' | 'route' };

/**
 * The pages of the open project, in their order: to choose one, to move it, to remove it, and to
 * add one. Every change is a command, so every change can be undone: nothing asks to be confirmed.
 */
export function PagesNav(props: {
  project: ProjectState;
  selected: Id<'page'>;
  onSelect(id: Id<'page'>): void;
}) {
  const { project, selected, onSelect } = props;
  const { bus } = useServices();
  const ids = useId();
  const [failure, setFailure] = useState<Failure | null>(null);

  /** Runs a command; the error it is refused with is shown, on the field it is about if there is one. */
  const run = (command: Parameters<typeof bus.execute>[0]): Failure | null => {
    const result = bus.execute(command);
    if (result.ok) {
      setFailure(null);
      return null;
    }
    const field = pageAddField(result.error);
    const found: Failure =
      field === undefined
        ? { message: pageAddMessage(result.error) }
        : { message: pageAddMessage(result.error), field };
    setFailure(found);
    return found;
  };

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const key = String(data.get('key') ?? '').trim();
    const typedRoute = String(data.get('route') ?? '').trim();
    // The first field that is wrong takes the focus, so that the keyboard goes where the work is.
    const focus = (field: 'key' | 'route') =>
      form.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
    if (key === '') {
      setFailure({ message: t('pages.error.keyRequired'), field: 'key' });
      focus('key');
      return;
    }
    const command = pageAdd({ key, route: typedRoute === '' ? `/${key}` : typedRoute, title: key });
    const refused = run(command);
    if (refused === null) {
      form.reset();
      onSelect(command.payload.pageId);
    } else if (refused.field !== undefined) {
      focus(refused.field);
    }
  }

  const last = project.pages.order.length - 1;
  return (
    <>
      <h2>{t('pages.title')}</h2>
      <ul className="pages-list">
        {project.pages.order.map((id, index) => {
          const page = project.pages.byId[id];
          if (page === undefined) return null;
          const pageId = page.id;
          const named = { name: page.key };
          return (
            <li key={id} className="pages-item">
              <button
                type="button"
                className="pages-select"
                aria-current={pageId === selected ? 'true' : undefined}
                onClick={() => onSelect(pageId)}
              >
                {page.key}
              </button>
              <span className="pages-route">
                {pageId === project.initialPageId
                  ? t('pages.initial', { route: page.route })
                  : page.route}
              </span>
              <span className="pages-actions">
                <button
                  type="button"
                  aria-label={t('pages.moveUpNamed', named)}
                  disabled={index === 0}
                  onClick={() => run(pageMove({ pageId, toIndex: index - 1 }))}
                >
                  {t('pages.moveUp')}
                </button>
                <button
                  type="button"
                  aria-label={t('pages.moveDownNamed', named)}
                  disabled={index === last}
                  onClick={() => run(pageMove({ pageId, toIndex: index + 1 }))}
                >
                  {t('pages.moveDown')}
                </button>
                <button
                  type="button"
                  aria-label={t('pages.removeNamed', named)}
                  disabled={pageId === project.initialPageId}
                  onClick={() => run(pageRemove({ pageId }))}
                >
                  {t('pages.remove')}
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <form className="pages-add" aria-labelledby={`${ids}-add`} onSubmit={add} noValidate>
        <h3 id={`${ids}-add`}>{t('pages.addTitle')}</h3>
        <label htmlFor={`${ids}-key`}>{t('pages.key')}</label>
        <input
          id={`${ids}-key`}
          name="key"
          maxLength={64}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={failure?.field === 'key'}
          aria-describedby={failure?.field === 'key' ? `${ids}-error` : undefined}
        />
        <label htmlFor={`${ids}-route`}>{t('pages.route')}</label>
        <input
          id={`${ids}-route`}
          name="route"
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={failure?.field === 'route'}
          aria-describedby={failure?.field === 'route' ? `${ids}-error` : undefined}
        />
        {failure === null ? null : (
          <div id={`${ids}-error`} className="field-error" role="alert">
            {failure.message}
          </div>
        )}
        <button type="submit">{t('pages.add')}</button>
      </form>
    </>
  );
}
