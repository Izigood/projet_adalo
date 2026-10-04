import { useEffect } from 'react';
import type { CommandBus } from '../commands/bus.js';
import { t } from '../i18n.js';
import { useServices } from './services-context.js';
import { useView } from './use-view.js';

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/;

/**
 * Ctrl or Cmd + Z undoes, Ctrl or Cmd + Shift + Z and Ctrl + Y redo (EF-UI-06). A field that is
 * being typed in keeps its own undo: the browser's, for the text.
 */
function useHistoryShortcuts(bus: CommandBus): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (TYPING.test(target.tagName) || target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      const redo = (key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey);
      const undo = key === 'z' && !event.shiftKey;
      if (!undo && !redo) return;
      event.preventDefault();
      if (undo) bus.undo();
      else bus.redo();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [bus]);
}

/** The two buttons; each says in its title which command it would undo or redo. */
export function HistoryControls() {
  const { bus } = useServices();
  const history = useView(bus.history);
  useHistoryShortcuts(bus);
  const next = history.undo.at(-1);
  const again = history.redo.at(-1);
  return (
    <div className="history-controls">
      <button
        type="button"
        disabled={next === undefined}
        aria-keyshortcuts="Control+Z Meta+Z"
        title={next === undefined ? t('history.undo') : t('history.undoTitle', { label: next })}
        onClick={() => bus.undo()}
      >
        {t('history.undo')}
      </button>
      <button
        type="button"
        disabled={again === undefined}
        aria-keyshortcuts="Control+Shift+Z Control+Y Meta+Shift+Z"
        title={again === undefined ? t('history.redo') : t('history.redoTitle', { label: again })}
        onClick={() => bus.redo()}
      >
        {t('history.redo')}
      </button>
    </div>
  );
}
