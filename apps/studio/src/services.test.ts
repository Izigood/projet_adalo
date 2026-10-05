import { describe, expect, it } from 'vitest';
import { browser } from '../test-kit/ui.js';
import { projectUpdate } from './commands/project-commands.js';
import { createStudioServices } from './services.js';

describe('the services the Studio is built from', () => {
  it('tell the catalogue which project is open: it cannot be put in the trash, which would end its saves', async () => {
    const services = createStudioServices(browser());
    const made = await services.session.create({ key: 'DEMO', name: 'Demo' });
    if (!made.ok) throw new Error(made.error.message);

    const refused = await services.catalog.trash(made.value.id);
    expect(refused.ok ? '' : refused.error.code).toBe('CONSTRAINT_VIOLATION');
    const listed = await services.catalog.list({ status: 'active' });
    expect(listed.ok && listed.value.map((entry) => entry.key)).toEqual(['DEMO']);

    await services.session.close();
    const trashed = await services.catalog.trash(made.value.id);
    expect(trashed.ok && trashed.value.status).toBe('trashed');
  });

  it('save what waits in the open project before the catalogue copies it', async () => {
    const services = createStudioServices(browser());
    const made = await services.session.create({ key: 'DEMO', name: 'Avant' });
    if (!made.ok) throw new Error(made.error.message);
    services.bus.execute(projectUpdate({ name: 'Après' }));
    const copy = await services.catalog.duplicate(made.value.id);
    expect(copy.ok && copy.value.name).toBe('Après (copie)');
  });
});
