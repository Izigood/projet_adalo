import { useState } from 'react';
import { t } from '../i18n.js';
import { formatDateTime } from './format.js';
import { useServices } from './services-context.js';
import { useView } from './use-view.js';

/**
 * The recovery draft on offer for the open project (RG-13): the work of the last session that could
 * not be saved because the project did not validate. It is taken back or thrown away, never decided
 * for the person; the project opened is the one that was saved.
 */
export function RecoveryBanner() {
  const { session } = useServices();
  const offer = useView(session.draft);
  const [failure, setFailure] = useState<'recover' | 'dismiss' | null>(null);
  if (offer === null) return null;

  const date = formatDateTime(offer.savedAt);
  const message =
    offer.issues === 0
      ? t('recovery.message.valid', { date })
      : offer.issues === 1
        ? t('recovery.message.one', { date })
        : t('recovery.message.other', { date, count: offer.issues });

  return (
    <div className="banner" role="alert">
      <p>{message}</p>
      <div className="catalog-meta">{t('recovery.warning')}</div>
      <div className="banner-actions">
        <button
          type="button"
          onClick={async () => setFailure((await session.recover()).ok ? null : 'recover')}
        >
          {t('recovery.recover')}
        </button>
        <button
          type="button"
          onClick={async () => setFailure((await session.dismissDraft()).ok ? null : 'dismiss')}
        >
          {t('recovery.dismiss')}
        </button>
      </div>
      {failure === null ? null : (
        <p className="banner-failure">
          {failure === 'recover' ? t('recovery.failed') : t('recovery.dismissFailed')}
        </p>
      )}
    </div>
  );
}
