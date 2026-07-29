export type TransactionCleanupRule = {
  merchantId: string | null;
  categoryId: string | null;
};

export type PendingCleanupEdits = {
  merchantId: string | null;
  merchantOverridden: boolean;
  categoryId: string | null;
  needsReview: boolean;
};

/** Must stay equivalent to `public.normalize_transaction_match(text)`. */
export function normalizeTransactionMatch(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Resolves user edits, a deterministic rule, and Plaid's defaults in that
 * order. A pending transaction's explicit merchant always wins when it posts.
 */
export function resolveTransactionCleanup(input: {
  bankMerchantId: string | null;
  bankCategoryId: string | null;
  rule?: TransactionCleanupRule;
  pending?: PendingCleanupEdits;
}): {
  merchantId: string | null;
  categoryId: string | null;
  needsReview: boolean;
  merchantOverridden: boolean;
} {
  return {
    merchantId: input.pending?.merchantOverridden
      ? input.pending.merchantId
      : input.rule?.merchantId ?? input.bankMerchantId,
    categoryId:
      input.pending?.categoryId ??
      input.rule?.categoryId ??
      input.bankCategoryId,
    needsReview: input.pending
      ? input.pending.needsReview
      : !input.rule,
    merchantOverridden:
      Boolean(input.pending?.merchantOverridden) ||
      Boolean(input.rule?.merchantId),
  };
}
