import { t } from '../i18n.js';
import type { CommandHandler, CommandTable, DesignCommand } from './command.js';

/** What can change in the metadata of a project; its `id` and its `key` do not (RG-11). */
export type ProjectUpdate = {
  readonly name?: string;
  readonly description?: string;
  readonly author?: string;
  readonly locale?: string;
  readonly version?: string;
};

const FIELDS = ['name', 'description', 'author', 'locale', 'version'] as const;

const update: CommandHandler<ProjectUpdate> = (draft, payload) => {
  for (const field of FIELDS) {
    const value = payload[field];
    if (value !== undefined) draft.project[field] = value;
  }
  return undefined;
};

export const projectUpdate = (payload: ProjectUpdate): DesignCommand<ProjectUpdate> => ({
  type: 'CMD-PROJECT-UPDATE',
  payload,
  label: t('command.projectUpdate'),
});

/** The commands on the project itself. */
export const PROJECT_COMMANDS: CommandTable = {
  'CMD-PROJECT-UPDATE': update as CommandHandler,
};
