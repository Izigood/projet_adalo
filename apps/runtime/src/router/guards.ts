import { hasRole } from '@acs/domain';
import type { UserContext } from '@acs/domain';
import type { Page } from '@acs/project-schema';

export type PageGuard = Page['guards'][number];

/** Why a page is refused; the interface turns it into a message. */
export type GuardDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: 'role-missing' | 'expression-unsupported';
      readonly guardIndex: number;
    };

/**
 * Decides whether the user may open a page: every guard must pass, and a page without guards is
 * open to everyone. A `role` guard needs the user to hold the role. An `expression` guard is
 * refused until the expression engine exists (lot 8): refusing is the only safe answer to a
 * condition that cannot be evaluated. In local mode this filters the interface, nothing more
 * (dossier 2.2).
 */
export function evaluateGuards(
  guards: readonly PageGuard[],
  user: UserContext | null,
): GuardDecision {
  for (const [guardIndex, guard] of guards.entries()) {
    if (guard.kind === 'role') {
      if (!hasRole(user, guard.role)) return { allowed: false, reason: 'role-missing', guardIndex };
    } else {
      return { allowed: false, reason: 'expression-unsupported', guardIndex };
    }
  }
  return { allowed: true };
}
