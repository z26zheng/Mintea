import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assessConnection,
  summarizeConnections,
  CONSENT_WARNING_DAYS,
  STALE_AFTER_DAYS,
} from '../packages/core/src/domain/connectionHealth.ts';

const NOW = new Date('2026-07-29T12:00:00Z');

const item = (overrides = {}) => ({
  status: 'good',
  error_code: null,
  error_message: null,
  last_synced_at: '2026-07-29T06:00:00Z',
  consent_expires_at: null,
  institution_name: 'Chase',
  ...overrides,
});

test('a healthy, freshly synced connection is quiet', () => {
  const health = assessConnection(item(), NOW);
  assert.equal(health.severity, 'ok');
  assert.equal(health.label, 'Connected');
  assert.equal(health.action, null);
});

test('translates a Plaid error code into something actionable', () => {
  const health = assessConnection(
    item({ status: 'login_required', error_code: 'ITEM_LOGIN_REQUIRED' }),
    NOW,
  );

  assert.equal(health.severity, 'critical');
  assert.equal(health.label, 'Needs sign-in');
  assert.match(health.detail, /sign in again/);
  assert.equal(health.action, 'reconnect');
});

test('falls back to the bank message rather than swallowing an unknown code', () => {
  const health = assessConnection(
    item({
      status: 'error',
      error_code: 'SOME_NEW_CODE_WE_HAVE_NOT_SEEN',
      error_message: 'The institution is temporarily unavailable.',
    }),
    NOW,
  );

  assert.equal(health.detail, 'The institution is temporarily unavailable.');
  assert.equal(health.action, 'reconnect');
});

test('still says something useful when Plaid gives no message at all', () => {
  const health = assessConnection(
    item({ status: 'error', error_code: null, error_message: null }),
    NOW,
  );

  assert.equal(health.severity, 'critical');
  assert.ok(health.detail.length > 0);
  assert.equal(health.action, 'reconnect');
});

test('warns before consent expires, not after', () => {
  const soon = new Date(NOW.getTime() + (CONSENT_WARNING_DAYS - 1) * 86_400_000);
  const health = assessConnection(
    item({ consent_expires_at: soon.toISOString() }),
    NOW,
  );

  assert.equal(health.severity, 'warning');
  assert.equal(health.label, 'Expiring soon');
  assert.equal(health.action, 'reconnect');
});

test('treats a healthy connection with distant consent expiry as fine', () => {
  const later = new Date(NOW.getTime() + (CONSENT_WARNING_DAYS + 10) * 86_400_000);
  const health = assessConnection(
    item({ consent_expires_at: later.toISOString() }),
    NOW,
  );

  assert.equal(health.severity, 'ok');
});

test('expired consent is critical even while the status still reads good', () => {
  // Plaid can leave status untouched until the next sync attempt; the date is
  // what the user actually needs to act on.
  const past = new Date(NOW.getTime() - 86_400_000);
  const health = assessConnection(
    item({ consent_expires_at: past.toISOString() }),
    NOW,
  );

  assert.equal(health.severity, 'critical');
  assert.equal(health.action, 'reconnect');
});

test('flags a connection that reports success but has gone quiet', () => {
  const old = new Date(NOW.getTime() - STALE_AFTER_DAYS * 86_400_000);
  const health = assessConnection(
    item({ last_synced_at: old.toISOString() }),
    NOW,
  );

  assert.equal(health.severity, 'warning');
  assert.equal(health.label, 'Out of date');
  assert.match(health.detail, /may be behind/);
});

test('does not offer reconnect for mere staleness', () => {
  // The connection reports healthy, so sending the user through Link would
  // most likely change nothing.
  const old = new Date(NOW.getTime() - (STALE_AFTER_DAYS + 30) * 86_400_000);
  assert.equal(
    assessConnection(item({ last_synced_at: old.toISOString() }), NOW).action,
    null,
  );
});

test('a never-synced connection is informational, not an error', () => {
  const health = assessConnection(item({ last_synced_at: null }), NOW);
  assert.equal(health.severity, 'info');
  assert.equal(health.action, null);
});

test('summary stays silent when every connection is healthy', () => {
  const summary = summarizeConnections([item(), item()], NOW);
  assert.equal(summary.severity, 'ok');
  assert.equal(summary.needingAttention, 0);
  assert.equal(summary.message, null);
});

test('summary leads with the most severe connection', () => {
  const stale = new Date(NOW.getTime() - 30 * 86_400_000).toISOString();
  const summary = summarizeConnections(
    [
      item({ institution_name: 'PNC', last_synced_at: stale }),
      item({
        institution_name: 'Chase',
        status: 'login_required',
        error_code: 'ITEM_LOGIN_REQUIRED',
      }),
    ],
    NOW,
  );

  assert.equal(summary.severity, 'critical');
  assert.equal(summary.needingAttention, 2);
  assert.match(summary.message, /^Chase:/);
  assert.match(summary.message, /1 other connection also needs attention/);
});

test('summary counts only what is actually wrong', () => {
  const summary = summarizeConnections(
    [item(), item({ status: 'revoked' }), item()],
    NOW,
  );

  assert.equal(summary.needingAttention, 1);
  assert.doesNotMatch(summary.message, /other connection/);
});
