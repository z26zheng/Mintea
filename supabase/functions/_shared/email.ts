/**
 * P11 boundary: this module is delivery infrastructure, not a notification
 * generator. The authenticated welcome endpoint is the only current direct-
 * send exception; product alerts must originate in P11's in-app notification
 * store and use this module only as an email delivery channel.
 */
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

export type EmailProviderStatus = {
  id: string;
  lastEvent: string | null;
};

export type EmailDeliveryMode = 'log' | 'send';

export type EmailConfig = {
  deliveryMode?: EmailDeliveryMode;
  apiKey?: string;
  from?: string;
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

function deliveryModeFromEnv(value: string | undefined): EmailDeliveryMode {
  const mode = value?.trim() || 'log';
  if (mode !== 'log' && mode !== 'send') {
    throw new Error('EMAIL_DELIVERY_MODE must be either "log" or "send"');
  }
  return mode;
}

export function emailConfigFromEnv(): EmailConfig {
  const deliveryMode = deliveryModeFromEnv(Deno.env.get('EMAIL_DELIVERY_MODE'));

  if (deliveryMode === 'log') {
    return { deliveryMode };
  }

  return {
    deliveryMode,
    apiKey: required('RESEND_API_KEY'),
    from: required('EMAIL_FROM'),
    replyTo: Deno.env.get('EMAIL_REPLY_TO')?.trim() || undefined,
  };
}

/**
 * Sends one transactional message through Resend's HTTPS API, or records a
 * log-only delivery when the environment is not configured for real sending.
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
  const deliveryMode = config.deliveryMode ?? (options.config ? 'send' : 'log');

  if (deliveryMode === 'log') {
    // Keep local and fixture E2E runs useful without logging message contents or
    // making a provider request. The fixture identity is intentionally not
    // deliverable; this mode is not a bounce or suppression mechanism.
    console.info('[email:log-only]', {
      to: message.to,
      subject: message.subject,
      idempotencyKey: message.idempotencyKey,
    });
    return { id: 'log-only' };
  }

  const apiKey = config.apiKey?.trim();
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');
  const from = config.from?.trim();
  if (!from) throw new Error('EMAIL_FROM is not configured');

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(RESEND_EMAILS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': message.idempotencyKey,
      'User-Agent': 'Mintea/transactional-email',
    },
    body: JSON.stringify({
      from,
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

  console.info('[email:provider-accepted]', {
    providerId: payload.id,
    idempotencyKey: message.idempotencyKey,
  });

  return { id: payload.id };
}

/**
 * Reads the provider-side lifecycle event for a sent message. This is an
 * explicitly separate diagnostic operation: a successful POST is already a
 * valid delivery handoff, so a status lookup failure must never turn a sent
 * message into a retry.
 */
export async function getEmailProviderStatus(
  providerId: string,
  options: {
    config?: EmailConfig;
    fetcher?: typeof fetch;
  } = {},
): Promise<EmailProviderStatus> {
  if (!providerId.trim()) throw new Error('Email providerId is required');

  const config = options.config ?? emailConfigFromEnv();
  const deliveryMode = config.deliveryMode ?? (options.config ? 'send' : 'log');
  if (deliveryMode === 'log') {
    return { id: providerId, lastEvent: 'log-only' };
  }

  const apiKey = config.apiKey?.trim();
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured');

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(
    `${RESEND_EMAILS_URL}/${encodeURIComponent(providerId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'Mintea/transactional-email',
      },
    },
  );
  const payload = (await response.json().catch(() => ({}))) as {
    id?: string;
    last_event?: string;
    message?: string;
    error?: string;
  };

  if (!response.ok || !payload.id) {
    throw new EmailDeliveryError(
      payload.message ?? payload.error ?? `Email provider returned ${response.status}`,
      response.status,
    );
  }

  return {
    id: payload.id,
    lastEvent: payload.last_event ?? null,
  };
}
