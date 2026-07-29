import type { MinteaClient } from './client';
import { unwrap } from './client';
import type {
  TransactionRuleApplyResultRow,
  TransactionRulePreviewRow,
  TransactionRuleRow,
} from '../types/database';

export async function fetchTransactionRules(
  client: MinteaClient,
): Promise<TransactionRuleRow[]> {
  return unwrap(
    await client
      .from('transaction_rules')
      .select('*')
      .order('created_at', { ascending: false }),
  );
}

export async function fetchTransactionRulePreview(
  client: MinteaClient,
  transactionId: string,
): Promise<TransactionRulePreviewRow> {
  const rows = unwrap(
    await client.rpc('transaction_rule_preview', {
      p_transaction_id: transactionId,
    }),
  );

  const preview = rows[0];
  if (!preview) throw new Error('Could not preview matching transactions');
  return preview;
}

export async function saveTransactionRule(
  client: MinteaClient,
  input: {
    transactionId: string;
    merchantId: string | null;
    categoryId: string | null;
    applyToExisting?: boolean;
  },
): Promise<TransactionRuleApplyResultRow> {
  const rows = unwrap(
    await client.rpc('save_transaction_rule', {
      p_transaction_id: input.transactionId,
      p_merchant_id: input.merchantId,
      p_category_id: input.categoryId,
      p_apply_to_existing: input.applyToExisting ?? true,
    }),
  );

  const result = rows[0];
  if (!result) throw new Error('Could not save the transaction rule');
  return result;
}

export async function setTransactionRuleEnabled(
  client: MinteaClient,
  ruleId: string,
  enabled: boolean,
): Promise<TransactionRuleRow> {
  return unwrap(
    await client
      .from('transaction_rules')
      .update({ enabled })
      .eq('id', ruleId)
      .select()
      .single(),
  );
}

export async function deleteTransactionRule(
  client: MinteaClient,
  ruleId: string,
): Promise<void> {
  const { error } = await client
    .from('transaction_rules')
    .delete()
    .eq('id', ruleId);

  if (error) throw new Error(error.message);
}
