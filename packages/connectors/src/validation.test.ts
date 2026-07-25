import { describe, expect, test } from 'bun:test';

import { object, string } from 'valibot';

import { ConnectorValidationError, validateConnectorValue } from './validation';

describe('connector validation', () => {
  test('returns validated values without filling missing fields', () => {
    const schema = object({ title: string() });

    expect(validateConnectorValue(schema, { title: 'Fixture' })).toEqual({ title: 'Fixture' });
    expect(() => validateConnectorValue(schema, {})).toThrow(ConnectorValidationError);
  });
});
