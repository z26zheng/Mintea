# Agent instructions

These instructions apply to the entire repository. Read `CONTRIBUTING.md` before
changing or testing the application.

## Test identities and Plaid Sandbox

- Mintea authentication and Plaid Link authentication are separate.
  `user_good` / `pass_good` (and MFA `1234`) are Plaid Sandbox credentials; they
  never sign a user into Mintea.
- A developer's personal Mintea account gets its own household. RLS prevents it
  from seeing the shared E2E household. Before opening Plaid Link, a maintainer
  must confirm that personal household has `plaid_environment = 'sandbox'`.
- The shared development project also has a disposable, passwordless E2E identity,
  `mintea-e2e@example.com`, for tests that need the existing fixture dataset. It
  has no shared password and no password belongs in the vault.
- A maintainer signs the E2E identity in with
  `python3 scripts/e2e_household.py login`, which generates a one-time admin link.
  Treat that link as an authentication credential: never place it in a commit,
  PR, issue, chat, screenshot, or rendered command output. An agent may generate
  it only when the user has explicitly approved a secure delivery destination;
  otherwise ask the maintainer to run the command locally and deliver it.
- Do not run `clone` or `teardown` merely to sign in. Those commands create or
  destroy the disposable fixture and require explicit fixture-maintenance intent.

See `README.md` under *End-to-end testing* and `CONTRIBUTING.md` under *Test
accounts* for the complete workflow.
