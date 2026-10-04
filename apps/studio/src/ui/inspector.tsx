import type { Id } from '@acs/domain';
import { pageRename } from '../commands/page-commands.js';
import { projectUpdate } from '../commands/project-commands.js';
import type { ProjectUpdate } from '../commands/project-commands.js';
import { t } from '../i18n.js';
import type { ProjectState } from '../project/project-state.js';
import { CommitField } from './commit-field.js';
import { errorMessage } from './errors.js';
import { pageAddMessage } from './pages-nav.js';
import { useServices } from './services-context.js';

/** The fields of the project that can be changed, with the label and the length of each. */
const PROJECT_FIELDS = [
  { field: 'name', label: 'inspector.name', max: 200, multiline: false },
  { field: 'description', label: 'inspector.description', max: 2000, multiline: true },
  { field: 'author', label: 'inspector.author', max: 200, multiline: false },
  { field: 'version', label: 'inspector.version', max: 64, multiline: false },
  { field: 'locale', label: 'inspector.locale', max: 8, multiline: false },
] as const satisfies readonly {
  field: keyof ProjectUpdate;
  label: Parameters<typeof t>[0];
  max: number;
  multiline: boolean;
}[];

/**
 * The inspector: the project, and the page that is chosen (ARC-STU-01). A value is a change like
 * any other, a command: it is undone like one, and it is not refused for being badly formed (a key
 * of a page that does not follow RG-11, a name that is empty): the project then does not validate,
 * the panel says so, and it is kept as a recovery draft until it does (RG-13). What is refused is
 * what makes no sense: a key or a route that another page has.
 */
export function Inspector(props: { project: ProjectState; pageId: Id<'page'> }) {
  const { project, pageId } = props;
  const { bus } = useServices();
  const page = project.pages.byId[pageId];

  return (
    <>
      <h2>{t('inspector.project')}</h2>
      <div className="catalog-meta">{t('inspector.key', { key: project.project.key })}</div>
      {PROJECT_FIELDS.map(({ field, label, max, multiline }) => (
        <CommitField
          key={field}
          label={t(label)}
          value={project.project[field]}
          maxLength={max}
          multiline={multiline}
          commit={(next) => {
            const result = bus.execute(projectUpdate({ [field]: next }));
            return result.ok ? null : errorMessage(result.error);
          }}
        />
      ))}

      {page === undefined ? null : (
        <>
          <h2>{t('inspector.page')}</h2>
          <CommitField
            label={t('inspector.pageKey')}
            value={page.key}
            maxLength={64}
            commit={(next) => {
              const result = bus.execute(pageRename({ pageId, key: next }));
              return result.ok ? null : pageAddMessage(result.error);
            }}
          />
          <CommitField
            label={t('inspector.pageRoute')}
            value={page.route}
            maxLength={200}
            commit={(next) => {
              const result = bus.execute(pageRename({ pageId, route: next }));
              return result.ok ? null : pageAddMessage(result.error);
            }}
          />
        </>
      )}
    </>
  );
}
