import type { DomainError } from '@acs/domain';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { t } from '../i18n.js';
import { errorMessage } from './errors.js';
import { useServices } from './services-context.js';

/** What went wrong, field by field; `general` is for what no field explains. */
export type FieldErrors = { key?: string; name?: string; general?: string };

/** The JSON Pointers of the issues the schemas found, as the manifest error carries them. */
function pointersOf(error: DomainError): string[] {
  const issues = error.details?.['issues'];
  if (!Array.isArray(issues)) return [];
  return issues.flatMap((issue) =>
    typeof issue === 'object' && issue !== null && typeof issue.path === 'string'
      ? [issue.path as string]
      : [],
  );
}

/**
 * What to tell the person about a project that could not be created (EF-PRJ-01): the field that is
 * wrong, in words, or what is wrong with the storage or the key they chose. The schemas decide what
 * a valid project is, the same ones that check a package that is imported; this only says it.
 */
export function fieldErrorsOf(error: DomainError): FieldErrors {
  if (error.code === 'MANIFEST_INVALID') {
    const pointers = pointersOf(error);
    const found: FieldErrors = {};
    if (pointers.includes('/project/key')) found.key = t('create.error.key');
    if (pointers.includes('/project/name')) found.name = t('create.error.name');
    if (found.key === undefined && found.name === undefined)
      found.general = t('create.error.invalid');
    return found;
  }
  if (error.code === 'CONSTRAINT_VIOLATION' && error.details?.['field'] === 'key') {
    return { key: t('error.keyTaken') };
  }
  return { general: errorMessage(error) };
}

/** The form that creates a project (EF-PRJ-01), which is opened as soon as it exists. */
export function CreateProjectForm() {
  const { session } = useServices();
  const ids = useId();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A second press while the first is on its way would ask for the same project twice.
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? '').trim();
    const result = await session.create({
      key: text('key'),
      name: text('name'),
      description: text('description'),
      author: text('author'),
    });
    busy.current = false;
    setPending(false);
    if (result.ok) {
      setErrors({});
      form.reset();
      return;
    }
    const found = fieldErrorsOf(result.error);
    setErrors(found);
    // The first field that is wrong takes the focus, so that the keyboard goes where the work is.
    const first = found.key !== undefined ? 'key' : found.name !== undefined ? 'name' : undefined;
    if (first !== undefined) form.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
  }

  const describedBy = (field: 'key' | 'name') =>
    [
      field === 'key' ? `${ids}-key-hint` : undefined,
      errors[field] === undefined ? undefined : `${ids}-${field}-error`,
    ]
      .filter((id) => id !== undefined)
      .join(' ') || undefined;

  return (
    <form className="create-project" aria-labelledby={`${ids}-title`} onSubmit={submit} noValidate>
      <h3 id={`${ids}-title`}>{t('create.title')}</h3>

      <label htmlFor={`${ids}-key`}>{t('create.key')}</label>
      <input
        id={`${ids}-key`}
        name="key"
        maxLength={16}
        autoComplete="off"
        spellCheck={false}
        aria-required="true"
        aria-invalid={errors.key !== undefined}
        aria-describedby={describedBy('key')}
      />
      <div id={`${ids}-key-hint`} className="field-hint">
        {t('create.keyHint')}
      </div>
      {errors.key === undefined ? null : (
        <div id={`${ids}-key-error`} className="field-error" role="alert">
          {errors.key}
        </div>
      )}

      <label htmlFor={`${ids}-name`}>{t('create.name')}</label>
      <input
        id={`${ids}-name`}
        name="name"
        maxLength={200}
        autoComplete="off"
        aria-required="true"
        aria-invalid={errors.name !== undefined}
        aria-describedby={describedBy('name')}
      />
      {errors.name === undefined ? null : (
        <div id={`${ids}-name-error`} className="field-error" role="alert">
          {errors.name}
        </div>
      )}

      <label htmlFor={`${ids}-description`}>{t('create.description')}</label>
      <textarea id={`${ids}-description`} name="description" maxLength={2000} rows={3} />

      <label htmlFor={`${ids}-author`}>{t('create.author')}</label>
      <input id={`${ids}-author`} name="author" maxLength={200} autoComplete="name" />

      {errors.general === undefined ? null : (
        <div className="field-error" role="alert">
          {errors.general}
        </div>
      )}
      <button type="submit" disabled={pending}>
        {t('create.submit')}
      </button>
    </form>
  );
}
