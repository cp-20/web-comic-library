import { safeParse } from 'valibot';
import type { GenericSchema, InferOutput } from 'valibot';

export class ConnectorValidationError extends Error {
  readonly code = 'validation' as const;
  readonly issueCount: number;

  constructor(issueCount: number) {
    super(`connector value failed validation with ${issueCount} issue(s)`);
    this.name = 'ConnectorValidationError';
    this.issueCount = issueCount;
  }
}

export const validateConnectorValue = <Schema extends GenericSchema>(
  schema: Schema,
  value: unknown,
): InferOutput<Schema> => {
  const result = safeParse(schema, value);

  if (!result.success) {
    throw new ConnectorValidationError(result.issues.length);
  }

  return result.output;
};
