import { describe, expect, it } from 'vitest';
import type { UserContext } from '@acs/domain';
import { evaluateGuards } from './guards.js';

const user = (roles: readonly string[]): UserContext => ({
  id: 'u',
  displayName: 'Utilisateur local',
  roles,
  attributes: {},
  locale: 'fr-FR',
});
const role = (name: string) => ({ kind: 'role', role: name }) as const;
const expression = (expr: string) => ({ kind: 'expression', expr }) as const;

describe('evaluateGuards', () => {
  it('opens a page without guards to everyone, signed in or not', () => {
    expect(evaluateGuards([], null)).toEqual({ allowed: true });
    expect(evaluateGuards([], user([]))).toEqual({ allowed: true });
  });

  it('opens a role guard only to a user holding the role', () => {
    expect(evaluateGuards([role('admin')], user(['admin']))).toEqual({ allowed: true });
    expect(evaluateGuards([role('admin')], user(['reader']))).toEqual({
      allowed: false,
      reason: 'role-missing',
      guardIndex: 0,
    });
  });

  it('refuses a role guard when nobody is signed in', () => {
    expect(evaluateGuards([role('admin')], null)).toMatchObject({ allowed: false });
  });

  it('needs every guard to pass and names the first one that fails', () => {
    const guards = [role('reader'), role('admin'), role('auditor')];
    expect(evaluateGuards(guards, user(['reader', 'admin', 'auditor']))).toEqual({ allowed: true });
    expect(evaluateGuards(guards, user(['reader', 'auditor']))).toEqual({
      allowed: false,
      reason: 'role-missing',
      guardIndex: 1,
    });
  });

  it('refuses an expression guard, whatever it says, until the engine exists', () => {
    for (const expr of ['true', '1 == 1', 'hasRole("admin")']) {
      expect(evaluateGuards([expression(expr)], user(['admin'])), expr).toEqual({
        allowed: false,
        reason: 'expression-unsupported',
        guardIndex: 0,
      });
    }
  });

  it('refuses a page whose later guard is an expression even when the role guard passes', () => {
    expect(evaluateGuards([role('admin'), expression('true')], user(['admin']))).toMatchObject({
      allowed: false,
      guardIndex: 1,
    });
  });
});
