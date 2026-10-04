import type { CommandTable } from './command.js';
import { PAGE_COMMANDS } from './page-commands.js';
import { PROJECT_COMMANDS } from './project-commands.js';

/** Every command the Studio can run. The next lots add theirs here (schema, canvas...). */
export const STANDARD_COMMANDS: CommandTable = { ...PROJECT_COMMANDS, ...PAGE_COMMANDS };
