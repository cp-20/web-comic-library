import webPush from 'web-push';

const vapidKeys = webPush.generateVAPIDKeys();
const request = webPush.generateRequestDetails(
  {
    endpoint: 'https://push.example.test/subscription',
    keys: {
      auth: Buffer.alloc(16).toString('base64url'),
      p256dh: webPush.generateVAPIDKeys().publicKey,
    },
  },
  JSON.stringify({ title: 'compatibility probe' }),
  {
    TTL: 60,
    vapidDetails: {
      privateKey: vapidKeys.privateKey,
      publicKey: vapidKeys.publicKey,
      subject: 'mailto:compatibility@example.test',
    },
  },
);

if (
  request.method !== 'POST' ||
  request.endpoint !== 'https://push.example.test/subscription' ||
  request.body.byteLength === 0
) {
  throw new Error('web-push request generation failed');
}
