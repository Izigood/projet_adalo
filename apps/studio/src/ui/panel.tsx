import { validateFiles } from '@acs/project-schema';
import type { FileIssue, FilesValidationDetails } from '@acs/project-schema';
import { useMemo } from 'react';
import { t } from '../i18n.js';
import { toFiles } from '../project/project-state.js';
import type { ProjectState } from '../project/project-state.js';
import { useServices } from './services-context.js';
import { useView } from './use-view.js';

/** How many commands and problems the panel lists before it says how many more there are. */
const SHOWN = 20;

/** The problems the structural validation finds in the project as it is now (RG-13). */
function problemsOf(project: ProjectState): readonly FileIssue[] {
  const checked = validateFiles(toFiles(project));
  if (checked.ok) return [];
  return (checked.error.details as unknown as FilesValidationDetails).issues;
}

/**
 * The panel below the work area: the commands that can be undone, and what is wrong with the
 * project. The problems are those that keep it from being saved (the project goes to a recovery
 * draft until it validates again); they are given as the schemas give them, with the file and the
 * place in it, which is what whoever mends the project needs.
 */
export function Panel(props: { project: ProjectState }) {
  const { bus } = useServices();
  const history = useView(bus.history);
  const problems = useMemo(() => problemsOf(props.project), [props.project]);
  const recent = history.undo.slice(-SHOWN).reverse();
  const older = history.undo.length - recent.length;
  const hidden = problems.length - SHOWN;

  return (
    <>
      <h2>{t('panel.history')}</h2>
      {recent.length === 0 ? (
        <div className="catalog-meta">{t('panel.historyEmpty')}</div>
      ) : (
        <ol className="history-list">
          {recent.map((label, index) => (
            <li key={`${history.undo.length - index}`}>{label}</li>
          ))}
        </ol>
      )}
      {older > 0 ? (
        <div className="catalog-meta">{t('panel.historyOlder', { count: older })}</div>
      ) : null}

      <h2>{t('panel.validation')}</h2>
      {problems.length === 0 ? (
        <div className="catalog-meta">{t('panel.valid')}</div>
      ) : (
        <>
          <div className="field-error">
            {problems.length === 1
              ? t('panel.problems.one')
              : t('panel.problems.other', { count: problems.length })}
          </div>
          <ul className="problems-list">
            {problems.slice(0, SHOWN).map((problem, index) => (
              <li key={`${problem.file}${problem.path}${index}`}>
                {t('panel.problem', {
                  file: problem.file,
                  path: problem.path,
                  message: problem.message,
                })}
              </li>
            ))}
          </ul>
          {hidden > 0 ? (
            <div className="catalog-meta">{t('panel.problemsMore', { count: hidden })}</div>
          ) : null}
        </>
      )}
    </>
  );
}
