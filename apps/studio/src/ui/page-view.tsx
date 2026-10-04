import type { Id } from '@acs/domain';
import { t } from '../i18n.js';
import type { ProjectState } from '../project/project-state.js';

/**
 * The page that is chosen, as the work area shows it for now: its key, its route and the title it
 * carries. The canvas, where it is drawn and edited, comes with lot 7 of the plan.
 */
export function PageView(props: { project: ProjectState; pageId: Id<'page'> }) {
  const page = props.project.pages.byId[props.pageId];
  if (page === undefined) return null;
  const title = page.nodes[page.rootNodeId]?.props['text'];
  return (
    <section className="page-view" aria-labelledby="page-view-title">
      <h2 id="page-view-title">{page.key}</h2>
      <div className="catalog-meta">{t('pages.routeLabel', { route: page.route })}</div>
      {typeof title === 'string' ? (
        <div className="page-title">{t('pages.titleLabel', { text: title })}</div>
      ) : null}
    </section>
  );
}
