import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEMPLATES = join(ROOT, 'supabase', 'templates');

const definitions = [
  ['confirmation', 'Confirm your Mintea email', 'confirmation.html'],
  ['recovery', 'Reset your Mintea password', 'recovery.html'],
  ['email_change', 'Confirm your new Mintea email', 'email_change.html'],
  ['invite', 'You’re invited to Mintea', 'invite.html'],
  [
    'password_changed_notification',
    'Your Mintea password was changed',
    'password_changed_notification.html',
  ],
  [
    'email_changed_notification',
    'Your Mintea email was changed',
    'email_changed_notification.html',
  ],
];

export async function authEmailTemplatePatch() {
  const patch = {};
  for (const [name, subject, filename] of definitions) {
    patch[`mailer_subjects_${name}`] = subject;
    patch[`mailer_templates_${name}_content`] = await readFile(
      join(TEMPLATES, filename),
      'utf8',
    );
  }

  patch.mailer_notifications_password_changed_enabled = true;
  patch.mailer_notifications_email_changed_enabled = true;
  return patch;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const projectRef = process.env.SUPABASE_PROJECT_REF?.trim();
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();

  if (!projectRef) throw new Error('SUPABASE_PROJECT_REF is required');
  if (!dryRun && !accessToken) {
    throw new Error('SUPABASE_ACCESS_TOKEN is required unless --dry-run is used');
  }

  const patch = await authEmailTemplatePatch();
  if (dryRun) {
    console.log(
      `Validated ${definitions.length} templates for project ${projectRef.slice(0, 4)}…${projectRef.slice(-4)}.`,
    );
    return;
  }

  const response = await fetch(
    `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/config/auth`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    },
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Supabase rejected the templates (${response.status}): ${message}`);
  }

  console.log(`Published ${definitions.length} Mintea Auth email templates.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
