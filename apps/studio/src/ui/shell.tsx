import type { Id } from '@acs/domain';
import { useState } from 'react';
import { t } from '../i18n.js';
import { CatalogScreen } from './catalog-screen.js';
import { HistoryControls } from './history-controls.js';
import { Inspector } from './inspector.js';
import { PageView } from './page-view.js';
import { PagesNav } from './pages-nav.js';
import { Panel } from './panel.js';
import { PersistenceNotice } from './persistence-notice.js';
import { RecoveryBanner } from './recovery-banner.js';
import { SaveBadge } from './save-badge.js';
import { useServices } from './services-context.js';
import { useView } from './use-view.js';

/**
 * The five zones of the Studio (ARC-STU-01, ADR-0037): the top bar, the navigation on the left, the
 * work area in the middle, the inspector on the right and the panel below. Each is a landmark, so a
 * keyboard or screen-reader user can go from one to the next.
 */
export function Shell() {
  const { project, session } = useServices();
  const open = useView(project.view);
  const [chosen, setChosen] = useState<Id<'page'> | null>(null);
  /** Set when the project could not be closed: its changes could be neither saved nor kept. */
  const [stuck, setStuck] = useState(false);

  async function close() {
    const closed = await session.close();
    setStuck(!closed.ok);
  }
  // The page chosen, or the first one when it is gone (removed, or another project was opened).
  const selected =
    open === null
      ? null
      : chosen !== null && open.pages.byId[chosen] !== undefined
        ? chosen
        : open.initialPageId;

  return (
    <div className="studio-shell">
      <header className="zone zone-top">
        <h1>{t('studio.title')}</h1>
        {open === null ? null : (
          <>
            <span className="project-name">{open.project.name}</span>
            <button type="button" onClick={() => void close()}>
              {t('project.close')}
            </button>
          </>
        )}
        <HistoryControls />
        <SaveBadge />
      </header>
      <nav className="zone zone-nav" aria-label={t('zone.nav')}>
        {open === null || selected === null ? null : (
          <PagesNav project={open} selected={selected} onSelect={setChosen} />
        )}
      </nav>
      <main className="zone zone-work">
        {open === null || selected === null ? (
          <CatalogScreen />
        ) : (
          <>
            {stuck ? (
              <div className="banner banner-failure" role="alert">
                {t('project.closeRefused')}
              </div>
            ) : null}
            <RecoveryBanner />
            <PageView project={open} pageId={selected} />
          </>
        )}
        <PersistenceNotice />
      </main>
      <aside className="zone zone-inspector" aria-label={t('zone.inspector')}>
        {open === null || selected === null ? null : <Inspector project={open} pageId={selected} />}
      </aside>
      <section className="zone zone-panel" aria-label={t('zone.panel')}>
        {open === null ? null : <Panel project={open} />}
      </section>
    </div>
  );
}
