import { useEffect, useId, useState } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * A field of the inspector that changes the project when it is left or Enter is pressed, and only if
 * what was typed is not what is there: one command, so one entry in the history, not one per key
 * pressed. `commit` returns the words for a change that was refused, or null when it was made; a
 * refused change puts the field back to what the project holds and says why. The field follows the
 * project: when `value` changes (an undo, another page) what was typed gives way to it.
 */
export function CommitField(props: {
  label: string;
  value: string;
  commit(next: string): string | null;
  multiline?: boolean;
  maxLength?: number;
}) {
  const { label, value, commit, multiline = false, maxLength } = props;
  const id = useId();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value);
    setError(null);
  }, [value]);

  function apply() {
    const next = draft.trim();
    if (next === value) {
      setDraft(value);
      return;
    }
    const refused = commit(next);
    setError(refused);
    if (refused !== null) setDraft(value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      setDraft(value);
      setError(null);
    } else if (event.key === 'Enter' && !multiline) {
      event.preventDefault();
      apply();
    }
  }

  const shared = {
    id,
    value: draft,
    maxLength,
    'aria-invalid': error !== null,
    'aria-describedby': error === null ? undefined : `${id}-error`,
    onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
    onBlur: apply,
    onKeyDown,
  };

  return (
    <div className="commit-field">
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea rows={3} {...shared} /> : <input autoComplete="off" {...shared} />}
      {error === null ? null : (
        <div id={`${id}-error`} className="field-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
