import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dataCollection: {
    cookies: false,
    databaseQueryData: false,
    frameContextLines: 0,
    genAI: { inputs: false, outputs: false },
    graphQL: { document: false, variables: false },
    httpBodies: [],
    httpHeaders: { request: false, response: false },
    stackFrameVariables: false,
    urlQueryParams: false,
    userInfo: false,
  },
  dsn: process.env.SENTRY_DSN,
});
