#!/usr/bin/env node
// Migration history is append-only.
//
// Once a migration has run against the hosted project it can never be deleted
// or edited: the remote `schema_migrations` table still lists its version, so
// `supabase db push` and `supabase migration list` start reporting drift, and
// the file that documents what actually happened to the schema is gone. A
// feature that is being removed needs a *new* forward migration, not the
// deletion of the one that created it.
//
// This checks the working tree against a base ref (origin/main in CI) and
// fails on any migration that disappeared or changed. New files are fine —
// that is the whole point.
//
//   node scripts/check-migrations.mjs [baseRef]

import { execFileSync } from 'node:child_process';

const BASE = process.argv[2] ?? 'origin/main';
const DIR = 'supabase/migrations';

function git(args) {
  // `git show` on a deleted path is an expected outcome here, not a crash, so
  // its message must not reach the console as a bare `fatal:` line.
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function filesAt(ref) {
  const out = git(['ls-tree', '-r', '--name-only', ref, '--', DIR]).trim();
  return out ? out.split('\n').filter((name) => name.endsWith('.sql')) : [];
}

function blobAt(ref, path) {
  return git(['show', `${ref}:${path}`]);
}

let base;
try {
  base = git(['rev-parse', '--verify', `${BASE}^{commit}`]).trim();
} catch {
  console.error(`Cannot resolve base ref "${BASE}". Fetch it first.`);
  process.exit(2);
}

const problems = [];

for (const path of filesAt(base)) {
  let current;
  try {
    current = blobAt('HEAD', path);
  } catch {
    problems.push(
      `deleted: ${path}\n` +
        `    It has already run remotely. Restore the file and add a new dated\n` +
        `    migration that drops or transforms what it created.`,
    );
    continue;
  }

  if (current !== blobAt(base, path)) {
    problems.push(
      `modified: ${path}\n` +
        `    Applied migrations are immutable — the hosted database will not\n` +
        `    re-run this file. Put the change in a new migration instead.`,
    );
  }
}

// A duplicate version prefix makes the ordering — and therefore the resulting
// schema — depend on the filesystem rather than on the timestamp.
const versions = new Map();
for (const path of filesAt('HEAD')) {
  const version = path.split('/').pop().split('_')[0];
  if (!/^\d{14}$/.test(version)) {
    problems.push(`bad name: ${path}\n    Expected a 14-digit version prefix.`);
    continue;
  }
  if (versions.has(version)) {
    problems.push(
      `duplicate version ${version}:\n    ${versions.get(version)}\n    ${path}`,
    );
  }
  versions.set(version, path);
}

if (problems.length > 0) {
  console.error(`Migration history is not append-only against ${BASE}:\n`);
  for (const problem of problems) console.error(`  ${problem}\n`);
  process.exit(1);
}

console.log(
  `Migrations are append-only against ${BASE} (${versions.size} files).`,
);
