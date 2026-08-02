const RESEND_EMAILS_URL = 'https://api.resend.com/emails';

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  replyTo?: string;
};

export type EmailDelivery = {
  id: string;
};

export type EmailConfig = {
  apiKey: string;
  from: string;
  replyTo?: string;
};

export class EmailDeliveryError extends Error {
  readonly status: number;

  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.name = 'EmailDeliveryError';
    this.status = status;
  }
}

function required(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function emailConfigFromEnv(): EmailConfig {
  return {
    apiKey: required('RESEND_API_KEY'),
    from: required('EMAIL_FROM'),
    replyTo: Deno.env.get('EMAIL_REPLY_TO')?.trim() || undefined,
  };
}

/**
 * Sends one transactional message through Resend's HTTPS API.
 *
 * This intentionally uses fetch instead of the Node SDK so every Edge
 * Function shares a small, dependency-free delivery path. Callers must supply
 * a stable event key; Resend uses it to suppress duplicate retries for 24h.
 * Durable deduplication for recurring product events belongs in the database.
 */
export async function sendEmail(
  message: EmailMessage,
  options: {
    config?: EmailConfig;
    fetcher?: typeof fetch;
  } = {},
): Promise<EmailDelivery> {
  if (!message.idempotencyKey.trim() || message.idempotencyKey.length > 256) {
    throw new Error('Email idempotencyKey must contain 1 to 256 characters');
  }

  const config = options.config ?? emailConfigFromEnv();
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(RESEND_EMAILS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': message.idempotencyKey,
    },
    body: JSON.stringify({
      from: config.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ?? config.replyTo
        ? { reply_to: message.replyTo ?? config.replyTo }
        : {}),
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    error?: string;
  };

  if (!response.ok || !payload.id) {
    throw new EmailDeliveryError(
      payload.message ?? payload.error ?? `Email provider returned ${response.status}`,
      response.status,
    );
  }

  return { id: payload.id };
}
