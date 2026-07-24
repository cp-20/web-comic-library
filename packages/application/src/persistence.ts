export type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

type AfterCommitAction = () => Promise<void>;

export class TransactionContext {
  readonly #afterCommitActions: AfterCommitAction[] = [];

  afterCommit(action: AfterCommitAction): void {
    this.#afterCommitActions.push(action);
  }

  async runAfterCommit(): Promise<void> {
    const actions = this.#afterCommitActions.splice(0);
    await Promise.all(actions.map((action) => action()));
  }
}

export interface TransactionPort {
  transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T>;
}

export interface OutboxEventInput {
  readonly eventName: string;
  readonly idempotencyKey: string;
  readonly payload: JsonValue;
}

export type OutboxAppendResult =
  | { readonly eventId: string; readonly status: 'inserted' }
  | { readonly status: 'duplicate' };

export interface OutboxPort {
  append(context: TransactionContext, event: OutboxEventInput): Promise<OutboxAppendResult>;
}

export interface JobInput {
  readonly idempotencyKey: string;
  readonly payload: JsonValue;
  readonly taskIdentifier: string;
}

export type JobQueueResult = 'duplicate' | 'queued';

export interface JobQueuePort {
  enqueue(job: JobInput): Promise<JobQueueResult>;
}
