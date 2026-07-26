export type EmailDigestMessage = Readonly<{
  html: string;
  subject: string;
  text: string;
}>;

export const createEmailDigestMessage = (
  notificationCount: number,
  url: string,
): EmailDigestMessage => {
  if (!Number.isSafeInteger(notificationCount) || notificationCount < 1) {
    throw new Error('email digest must contain at least one notification');
  }
  if (!url.startsWith('https://')) throw new Error('email digest URL must use HTTPS');
  const subject = 'Web Comic Library 更新通知';
  return {
    html: `<p>更新通知が${notificationCount}件あります。</p><p><a href="${url}">通知を確認する</a></p>`,
    subject,
    text: `更新通知が${notificationCount}件あります。\n${url}`,
  };
};

export type EmailDeliveryOutcome = 'delivered' | 'permanent_failure' | 'retryable_failure';

export type EmailSender = Readonly<{
  send(to: string, message: EmailDigestMessage): Promise<EmailDeliveryOutcome>;
}>;

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export const createResendEmailSender = (
  apiKey: string,
  from: string,
  fetcher: Fetcher = fetch,
): EmailSender => ({
  async send(to, message): Promise<EmailDeliveryOutcome> {
    const response = await fetcher('https://api.resend.com/emails', {
      body: JSON.stringify({
        from,
        html: message.html,
        subject: message.subject,
        text: message.text,
        to,
      }),
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      method: 'POST',
    });
    if (response.ok) return 'delivered';
    if (
      response.status === 400 ||
      response.status === 403 ||
      response.status === 404 ||
      response.status === 422
    ) {
      return 'permanent_failure';
    }
    return 'retryable_failure';
  },
});
