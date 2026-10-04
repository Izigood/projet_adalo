import type { SaveStatus } from '../persistence/save-status.js';
import { t } from '../i18n.js';
import { useServices } from './services-context.js';
import { useView } from './use-view.js';

/** What the interface says of a save status; nothing when no project is open. */
export function saveMessage(status: SaveStatus): string {
  switch (status.phase) {
    case 'idle':
      return '';
    case 'unsaved':
      return t('save.unsaved');
    case 'saving':
      return t('save.saving');
    case 'saved':
      return t('save.saved');
    case 'draft':
      return status.issues === 1
        ? t('save.draft.one')
        : t('save.draft.other', { count: status.issues ?? 0 });
    case 'conflict':
      return t('save.conflict');
    case 'error':
      return t('save.error');
  }
}

/** Where the open project stands with the store (RG-13), announced politely when it changes. */
export function SaveBadge() {
  const { session } = useServices();
  const status = useView(session.status);
  return (
    <output className={`save-badge save-${status.phase}`} aria-live="polite">
      {saveMessage(status)}
    </output>
  );
}
