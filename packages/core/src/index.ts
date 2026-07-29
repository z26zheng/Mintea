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
export * from './domain/accountList';
export * from './domain/dataTrust';
export * from './domain/netWorth';
export * from './domain/financialCharts';
export * from './domain/property';
export * from './domain/tags';

export * from './db/client';
export * from './domain/csv';
export * from './db/session';
export * from './db/accounts';
export * from './db/categories';
export * from './db/transactions';
export * from './db/transactionRules';
export * from './db/netWorth';
export * from './db/financialCharts';
export * from './db/property';
export * from './db/tags';
export * from './db/export';

export * from './queries';

export * from './plaid';
export * from './property';
