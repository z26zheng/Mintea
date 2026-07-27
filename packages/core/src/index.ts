/**
 * @mintea/core — platform-agnostic domain layer.
 *
 * Nothing in this package may import `react-native`, `expo-*`, or `react-dom`.
 * That constraint is what lets the same logic back the web app, the iOS app,
 * and the Android app without a fork.
 */

export * from './types/database';

export * from './domain/money';
export * from './domain/dates';
export * from './domain/accounts';
export * from './domain/netWorth';

export * from './db/client';
export * from './db/session';
export * from './db/accounts';
export * from './db/categories';
export * from './db/transactions';
export * from './db/netWorth';

export * from './queries';

export * from './plaid';
