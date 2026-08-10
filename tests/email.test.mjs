import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EmailDeliveryError,
  getEmailProviderStatus,
  sendEmail,
} from '../supabase/functions/_shared/email.ts';
import {
  brandedEmail,
  notificationEmail,
  welcomeEmail,
} from '../supabase/functions/_shared/emailTemplates.ts';
import { authEmailTemplatePatch } from '../scripts/sync-auth-email-templates.mjs';

test('brandedEmail escapes user-controlled content and includes a text fallback', () => {
  const result = brandedEmail({
    preheader: 'A <private> update',
    title: 'Hello <script>alert(1)</script>',
    body: 'Account & balance are ready.',
    action: { label: 'Open Mintea', url: 'https://example.com/?a=1&b=2' },
  });

  assert.match(result.html, /Hello &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(result.html, /Account &amp; balance/);
  assert.match(result.html, /a=1&amp;b=2/);
  assert.doesNotMatch(result.html, /<script>alert/);
  assert.match(result.text, /Open Mintea: https:\/\/example.com\/\?a=1&b=2/);
});

test('sendEmail keeps secrets server-side and sends HTML plus plaintext', async () => {
  let request;
  const result = await sendEmail(
    {
      to: 'person@example.com',
      subject: 'Welcome',
      html: '<p>Welcome</p>',
      text: 'Welcome',
      idempotencyKey: 'welcome/user-123',
    },
    {
      config: {
        apiKey: 'server-secret',
        from: 'Mintea <notifications@example.com>',
        replyTo: 'support@example.com',
      },
      fetcher: async (url, init) => {
        request = { url, init };
        return new Response(JSON.stringify({ id: 'email_123' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  );

  assert.deepEqual(result, { id: 'email_123' });
  assert.equal(request.url, 'https://api.resend.com/emails');
  assert.equal(request.init.headers.Authorization, 'Bearer server-secret');
  assert.equal(request.init.headers['Idempotency-Key'], 'welcome/user-123');
  assert.equal(request.init.headers['User-Agent'], 'Mintea/transactional-email');
  assert.deepEqual(JSON.parse(request.init.body), {
    from: 'Mintea <notifications@example.com>',
    to: 'person@example.com',
    subject: 'Welcome',
    html: '<p>Welcome</p>',
    text: 'Welcome',
    reply_to: 'support@example.com',
  });
});

test('getEmailProviderStatus reads the provider lifecycle event without exposing message data', async () => {
  let request;
  const result = await getEmailProviderStatus('email_123', {
    config: {
      apiKey: 'server-secret',
      from: 'Mintea <notifications@example.com>',
    },
    fetcher: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({
        id: 'email_123',
        last_event: 'delivered',
        to: ['person@example.com'],
        html: '<p>private</p>',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  });

  assert.deepEqual(result, { id: 'email_123', lastEvent: 'delivered' });
  assert.equal(request.url, 'https://api.resend.com/emails/email_123');
  assert.equal(request.init.headers.Authorization, 'Bearer server-secret');
  assert.equal(request.init.headers['User-Agent'], 'Mintea/transactional-email');
});

test('sendEmail is log-only without contacting Resend when configured for local/E2E', async () => {
  let requestCount = 0;
  const logCalls = [];
  const originalInfo = console.info;
  console.info = (...args) => logCalls.push(args);

  try {
    const result = await sendEmail(
      {
        to: 'mintea-e2e@example.com',
        subject: 'Welcome',
        html: '<p>Welcome</p>',
        text: 'Welcome',
        idempotencyKey: 'welcome/e2e',
      },
      {
        config: { deliveryMode: 'log' },
        fetcher: async () => {
          requestCount += 1;
          throw new Error('fetch must not run in log-only mode');
        },
      },
    );

    assert.deepEqual(result, { id: 'log-only' });
    assert.equal(requestCount, 0);
    assert.deepEqual(logCalls, [[
      '[email:log-only]',
      {
        to: 'mintea-e2e@example.com',
        subject: 'Welcome',
        idempotencyKey: 'welcome/e2e',
      },
    ]]);
  } finally {
    console.info = originalInfo;
  }
});

test('sendEmail surfaces provider failures without discarding the status', async () => {
  await assert.rejects(
    sendEmail(
      {
        to: 'person@example.com',
        subject: 'Welcome',
        html: '<p>Welcome</p>',
        text: 'Welcome',
        idempotencyKey: 'welcome/user-123',
      },
      {
        config: { apiKey: 'server-secret', from: 'Mintea <x@example.com>' },
        fetcher: async () =>
          new Response(JSON.stringify({ message: 'Domain is not verified' }), {
            status: 422,
            headers: { 'Content-Type': 'application/json' },
          }),
      },
    ),
    (error) =>
      error instanceof EmailDeliveryError &&
      error.status === 422 &&
      error.message === 'Domain is not verified',
  );
});

test('sendEmail rejects invalid idempotency keys before making a request', async () => {
  await assert.rejects(
    sendEmail(
      {
        to: 'person@example.com',
        subject: 'Welcome',
        html: '<p>Welcome</p>',
        text: 'Welcome',
        idempotencyKey: '',
      },
      {
        config: { apiKey: 'server-secret', from: 'Mintea <x@example.com>' },
        fetcher: async () => {
          throw new Error('fetch must not run');
        },
      },
    ),
    /idempotencyKey must contain 1 to 256 characters/,
  );
});

test('hosted Auth template patch contains every branded lifecycle email', async () => {
  const patch = await authEmailTemplatePatch();

  for (const name of [
    'confirmation',
    'recovery',
    'email_change',
    'invite',
    'password_changed_notification',
    'email_changed_notification',
  ]) {
    assert.equal(typeof patch[`mailer_subjects_${name}`], 'string');
    assert.match(patch[`mailer_templates_${name}_content`], /Mintea/);
  }

  assert.equal(patch.mailer_notifications_password_changed_enabled, true);
  assert.equal(patch.mailer_notifications_email_changed_enabled, true);
});

test('welcome email includes Mintea branding, CTA, HTML, and plaintext', () => {
  const email = welcomeEmail();

  assert.match(email.html, /Take a sip of your wealth\./);
  assert.match(email.html, /https:\/\/mintea-seven\.vercel\.app\//);
  assert.match(email.text, /Open Mintea: https:\/\/mintea-seven\.vercel\.app\//);
  assert.match(email.text, /cash flow, and net worth/);
});

test('notification email uses the shared branded template and escapes alert copy', () => {
  const email = notificationEmail({
    title: 'Dining out is over budget',
    message: '$87.50 over your plan <now>',
    action: { label: 'Review budget', url: 'https://mintea.example/budget?a=1&b=2' },
  });

  assert.match(email.html, /Mintea notification/);
  assert.match(email.html, /\$87\.50 over your plan &lt;now&gt;/);
  assert.match(email.html, /Review budget/);
  assert.match(email.text, /\$87\.50 over your plan <now>/);
});
