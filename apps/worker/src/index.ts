import { createPostgresJobQueueMetrics } from '@web-comic-library/db';
import { createResendEmailSender, createWebPushSender } from '@web-comic-library/notifications';

import {
  createAccountDataExportWorkerHandler,
  createAccountDataPurgeWorkerHandler,
} from './account-data';
import { createBibliographyWorkerHandler } from './bibliography';
import { createEmailDigestWorkerHandler } from './email-digest';
import { createWorkerMetrics, startMetricsServer } from './metrics';
import { createNotificationWorkerHandler } from './notifications';
import { startWorker } from './worker';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidSubject = process.env.VAPID_SUBJECT;
const vapidValues = [vapidPrivateKey, vapidPublicKey, vapidSubject];
if (vapidValues.some((value) => value) && vapidValues.some((value) => !value)) {
  throw new Error(
    'VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, and VAPID_SUBJECT must be configured together',
  );
}
const webPushSender =
  vapidPrivateKey && vapidPublicKey && vapidSubject
    ? createWebPushSender({
        privateKey: vapidPrivateKey,
        publicKey: vapidPublicKey,
        subject: vapidSubject,
      })
    : null;

const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM;
const publicAppUrl = process.env.PUBLIC_APP_URL;
const emailValues = [resendApiKey, resendFrom, publicAppUrl];
if (emailValues.some((value) => value) && emailValues.some((value) => !value)) {
  throw new Error('RESEND_API_KEY, RESEND_FROM, and PUBLIC_APP_URL must be configured together');
}
const emailDigestHandler =
  resendApiKey && resendFrom && publicAppUrl
    ? createEmailDigestWorkerHandler(
        databaseUrl,
        createResendEmailSender(resendApiKey, resendFrom),
        new URL('/notifications', publicAppUrl).toString(),
      )
    : undefined;

const runner = await startWorker(
  databaseUrl,
  createBibliographyWorkerHandler(databaseUrl),
  createNotificationWorkerHandler(databaseUrl, webPushSender),
  emailDigestHandler,
  createAccountDataExportWorkerHandler(databaseUrl),
  createAccountDataPurgeWorkerHandler(databaseUrl),
);
const jobQueueMetrics = createPostgresJobQueueMetrics(databaseUrl);
const metrics = createWorkerMetrics(jobQueueMetrics);
const metricsPort = Number(process.env.METRICS_PORT ?? '3002');
if (!Number.isSafeInteger(metricsPort) || metricsPort < 1 || metricsPort > 65_535) {
  throw new Error('METRICS_PORT must be an integer between 1 and 65535');
}
const metricsServer = startMetricsServer(metrics, metricsPort);
let stopping = false;
const stop = (signal: string): void => {
  if (stopping) {
    return;
  }

  stopping = true;
  void Promise.all([runner.stop(signal), metricsServer.stop(), jobQueueMetrics.close()]);
};

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
console.log(`worker ready; metrics listening on ${metricsServer.url}`);
await runner.promise;
