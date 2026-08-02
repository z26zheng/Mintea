/**
 * The only platform globals `@mintea/core` relies on.
 *
 * The package compiles with `lib: ["ESNext"]` and `types: []` on purpose: no
 * DOM, so nothing here can quietly start using `document` or `window` and stop
 * working on native. WHATWG `URL` is the one exception — it is standard in
 * Node, in browsers, and in the React Native runtime once
 * `react-native-url-polyfill/auto` has loaded (the app imports it before any
 * core code runs).
 *
 * Declared narrowly rather than by widening `lib`, so this file is also the
 * list of what a new host environment has to provide.
 */

declare class URL {
  constructor(url: string, base?: string);
  readonly protocol: string;
  readonly host: string;
  readonly hostname: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  toString(): string;
}

declare class URLSearchParams {
  constructor(init?: string);
  get(name: string): string | null;
}
