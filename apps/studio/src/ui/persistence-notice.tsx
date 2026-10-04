import { t } from '../i18n.js';
import { useServices } from './services-context.js';
import { useView } from './use-view.js';

/**
 * Says that the browser may clear the Studio's data without warning (RG-15), when it did not agree
 * to keep it (or cannot be asked), and what to do about it: export the projects. Nothing is shown
 * while the answer is not in, or when the storage is persistent.
 */
export function PersistenceNotice() {
  const { persistence } = useServices();
  const state = useView(persistence);
  if (state !== 'best-effort' && state !== 'unsupported') return null;
  return (
    <div className="banner" role="status">
      {t('persistence.warning')}
    </div>
  );
}
