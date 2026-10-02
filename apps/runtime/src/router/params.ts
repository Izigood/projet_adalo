import { isUuidV7 } from '@acs/domain';

export type ParamType = 'string' | 'integer' | 'uuid';
export type ParamValue = string | number;

const INTEGER = /^(0|-?[1-9]\d*)$/;

/**
 * Reads a route parameter as its declared type (EF-NAV-01), or `undefined` when the text is not
 * a valid value of that type: an integer is a safe integer without sign-only zero or padding, a
 * uuid is a lower-case UUID v7 like every identifier of the project.
 */
export function parseParam(type: ParamType, raw: string): ParamValue | undefined {
  switch (type) {
    case 'string':
      return raw.length > 0 ? raw : undefined;
    case 'integer': {
      if (!INTEGER.test(raw)) return undefined;
      const value = Number(raw);
      return Number.isSafeInteger(value) ? value : undefined;
    }
    case 'uuid':
      return isUuidV7(raw) ? raw : undefined;
  }
}
