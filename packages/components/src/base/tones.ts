import { t } from '../i18n.js';

export type Tone = 'info' | 'success' | 'warning' | 'danger';

const LEAD = {
  info: 'text.alert.info',
  success: 'text.alert.success',
  warning: 'text.alert.warning',
  danger: 'text.alert.danger',
} as const;

/** The word that starts a message of a tone (« Erreur : »): the meaning never rests on colour alone. */
export function toneLead(tone: Tone): string {
  return t(LEAD[tone]);
}
