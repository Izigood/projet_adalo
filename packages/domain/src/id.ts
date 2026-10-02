declare const idBrand: unique symbol;

/** Branded identifier: prevents mixing ids of different objects (never reference by label). */
export type Id<Kind extends string = string> = string & { readonly [idBrand]: Kind };

/** Canonical UUID text form, lower case, with version nibble 7 and variant 10 (dossier 9.3). */
export const UUID_V7_PATTERN =
  '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

const UUID_V7 = new RegExp(UUID_V7_PATTERN);

export function isUuidV7(value: string): boolean {
  return UUID_V7.test(value);
}

export function asId<Kind extends string>(value: string): Id<Kind> | undefined {
  return isUuidV7(value) ? (value as Id<Kind>) : undefined;
}
