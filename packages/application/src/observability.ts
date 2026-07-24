export type JobQueueMetrics = Readonly<{
  available: number;
  failed: number;
  oldestAvailableSeconds: number;
  overdue: number;
}>;

export interface JobQueueMetricsPort {
  close(): Promise<void>;
  read(): Promise<JobQueueMetrics>;
}
