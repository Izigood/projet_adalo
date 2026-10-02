import { t } from './i18n.js';
import './app.css';

/** Studio shell. Skeleton: the five zones and the command bus arrive in lot 5. */
export function App() {
  return (
    <main className="studio-shell">
      <h1>{t('studio.title')}</h1>
      <p>{t('studio.subtitle')}</p>
    </main>
  );
}
