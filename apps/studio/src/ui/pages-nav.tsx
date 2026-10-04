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
  const [failure, setFailure] = useState<string | null>(null);

  const run = (command: Parameters<typeof bus.execute>[0]): boolean => {
    const result = bus.execute(command);
    setFailure(result.ok ? null : pageAddMessage(result.error));
    return result.ok;
  };

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const key = String(data.get('key') ?? '').trim();
    const typedRoute = String(data.get('route') ?? '').trim();
    if (key === '') {
      setFailure(t('pages.error.keyRequired'));
      return;
    }
    const command = pageAdd({ key, route: typedRoute === '' ? `/${key}` : typedRoute, title: key });
    if (run(command)) {
      form.reset();
      onSelect(command.payload.pageId);
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
        <input id={`${ids}-key`} name="key" maxLength={64} autoComplete="off" spellCheck={false} />
        <label htmlFor={`${ids}-route`}>{t('pages.route')}</label>
        <input
          id={`${ids}-route`}
          name="route"
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
        />
        {failure === null ? null : (
          <div className="field-error" role="alert">
            {failure}
          </div>
        )}
        <button type="submit">{t('pages.add')}</button>
      </form>
    </>
  );
}
