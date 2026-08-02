/**
 * Reading an incoming auth deep link.
 *
 * On the web Supabase reads the URL for us (`detectSessionInUrl`). On native
 * nothing does: the app is handed a `mintea://…` URL by the OS and has to
 * decide for itself what the link means before calling the matching Supabase
 * method. Getting that wrong is a security problem, not a UX one, so the
 * parsing lives here — pure, exhaustively tested, and free of any Expo or
 * Supabase import.
 *
 * Three shapes arrive in practice:
 *
 *   mintea:///?code=…                     PKCE — exchange it for a session
 *   mintea:///#access_token=…&type=…      implicit — set the session directly
 *   mintea:///?error=…&error_description=…  the link was refused upstream
 *
 * Anything else — a different scheme, an unexpected host, a link with no auth
 * material at all — must be ignored rather than guessed at.
 */

export type AuthLink =
  /** A PKCE authorization code to exchange for a session. */
  | { kind: 'code'; code: string; isRecovery: boolean }
  /** Tokens delivered directly in the fragment. */
  | {
      kind: 'tokens';
      accessToken: string;
      refreshToken: string;
      isRecovery: boolean;
    }
  /** The provider or Supabase rejected the link. */
  | { kind: 'error'; message: string }
  /** Not an auth link. Carry on as if nothing happened. */
  | { kind: 'none' };

/**
 * Destinations an auth link is allowed to name.
 *
 * These are exactly the paths the app hands to Supabase as `redirectTo`, so
 * anything else did not originate from a request this app made. A link that
 * names `mintea://attacker.example/` is refused rather than followed.
 */
const ALLOWED_ROUTES = new Set(['', 'auth/callback', 'reset-password']);

/** The route a recovery link lands on. */
const RECOVERY_ROUTE = 'reset-password';

/**
 * Collapses a custom-scheme URL into a single route string.
 *
 * `URL` splits `mintea://reset-password` into host `reset-password` with an
 * empty path, but `mintea:///reset-password` into an empty host with path
 * `/reset-password`. Both spellings reach the app — Android and some email
 * clients rewrite one into the other — and they mean the same screen, so the
 * two halves are joined before anything is decided.
 */
function routeOf(parsed: URL): string {
  return `${parsed.host}/${parsed.pathname}`
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
}

function paramsFrom(search: string): URLSearchParams {
  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

/**
 * Supabase puts implicit-flow tokens in the fragment, which `URL` exposes
 * verbatim. It is query-encoded, so it parses with the same reader.
 */
function fragmentParams(hash: string): URLSearchParams {
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

export type ParseAuthLinkOptions = {
  /** The app's own scheme, without `://`. Links using any other are ignored. */
  scheme: string;
};

export function parseAuthLink(
  url: string | null | undefined,
  { scheme }: ParseAuthLinkOptions,
): AuthLink {
  if (!url) return { kind: 'none' };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'none' };
  }

  // `URL` keeps the colon: "mintea:".
  if (parsed.protocol !== `${scheme}:`) return { kind: 'none' };

  const route = routeOf(parsed);
  if (!ALLOWED_ROUTES.has(route)) return { kind: 'none' };

  const query = paramsFrom(parsed.search);
  const fragment = fragmentParams(parsed.hash);
  const get = (name: string) => query.get(name) ?? fragment.get(name);

  const error = get('error') ?? get('error_code');
  if (error) {
    const description = get('error_description');
    return {
      kind: 'error',
      message: readableAuthError(error, description),
    };
  }

  // `type=recovery` is what separates "you clicked a password reset link" from
  // "you confirmed your email". Both produce a valid session, so without it a
  // reset link would silently drop the user on the dashboard with their old
  // password still in place.
  const isRecovery = get('type') === 'recovery' || route === RECOVERY_ROUTE;

  const code = get('code');
  if (code) return { kind: 'code', code, isRecovery };

  const accessToken = get('access_token');
  const refreshToken = get('refresh_token');
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken, isRecovery };
  }

  return { kind: 'none' };
}

/**
 * Turns Supabase's error codes into something worth showing a user. Unknown
 * codes pass through: a slightly technical message beats a wrong one.
 */
export function readableAuthError(
  code: string,
  description?: string | null,
): string {
  const normalized = code.toLowerCase();

  if (
    normalized.includes('expired') ||
    normalized === 'otp_expired' ||
    normalized === 'access_denied'
  ) {
    return 'That link has expired or was already used. Request a new one.';
  }

  if (description) return description.replace(/\+/g, ' ');

  return `Sign-in link failed (${code}).`;
}
