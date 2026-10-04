import { t } from '../i18n.js';
import { HistoryControls } from './history-controls.js';
import { SaveBadge } from './save-badge.js';
import { useServices } from './services-context.js';
import { useView } from './use-view.js';

/**
 * The five zones of the Studio (ARC-STU-01, ADR-0037): the top bar, the navigation on the left, the
 * work area in the middle, the inspector on the right and the panel below. Each is a landmark, so a
 * keyboard or screen-reader user can go from one to the next.
 */
export function Shell() {
  const { project } = useServices();
  const open = useView(project.view);
  return (
    <div className="studio-shell">
      <header className="zone zone-top">
        <h1>{t('studio.title')}</h1>
        {open === null ? null : <span className="project-name">{open.project.name}</span>}
        <HistoryControls />
        <SaveBadge />
      </header>
      <nav className="zone zone-nav" aria-label={t('zone.nav')} />
      <main className="zone zone-work">{open === null ? <p>{t('studio.subtitle')}</p> : null}</main>
      <aside className="zone zone-inspector" aria-label={t('zone.inspector')} />
      <section className="zone zone-panel" aria-label={t('zone.panel')} />
    </div>
  );
}
