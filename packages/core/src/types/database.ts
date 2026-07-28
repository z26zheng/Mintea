/**
 * Database types for the Mintea Postgres schema.
 *
 * These are hand-maintained to match `supabase/migrations/*.sql`. Once you have
 * a local or hosted project running you can regenerate them verbatim with:
 *
 *     npm run db:types
 *
 * Note on numbers: `bigint` columns arrive over PostgREST as JSON numbers. All
 * money is stored in integer cents, which stays exact in a float64 up to
 * ~9e15 cents (~$90 trillion), so `number` is safe here.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/**
 * Builds the Row/Insert/Update triple Supabase's client expects.
 *
 * `Defaulted` are columns the database fills in when omitted (defaults, generated
 * ids, timestamps) — optional on insert. `Nullable` columns are optional too.
 */
type TableDef<Row, Defaulted extends keyof Row = never> = {
  Row: Row;
  Insert: Omit<Row, Defaulted> & Partial<Pick<Row, Defaulted>>;
  Update: Partial<Row>;
  Relationships: [];
};

type Timestamps = 'created_at' | 'updated_at';

export type AccountType =
  | 'depository'
  | 'credit'
  | 'loan'
  | 'investment'
  | 'real_estate'
  | 'other';

/** How a property's current value was arrived at. */
export type ValuationSource = 'manual' | 'rentcast';

export type CategoryType = 'income' | 'expense' | 'transfer';

export type PlaidItemStatus =
  | 'good'
  | 'login_required'
  | 'pending_expiration'
  | 'error'
  | 'revoked';

export type HouseholdRole = 'owner' | 'member' | 'viewer';

// ---------------------------------------------------------------- row shapes

export type HouseholdRow = {
  id: string;
  name: string;
  timezone: string;
  created_at: string;
};

export type HouseholdMemberRow = {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  created_at: string;
};

export type ProfileRow = {
  id: string;
  household_id: string;
  display_name: string | null;
  currency: string;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type PlaidItemRow = {
  id: string;
  household_id: string;
  plaid_item_id: string;
  plaid_institution_id: string | null;
  institution_name: string | null;
  institution_logo: string | null;
  plaid_phone_number: string | null;
  status: PlaidItemStatus;
  error_code: string | null;
  error_message: string | null;
  transactions_cursor: string | null;
  last_synced_at: string | null;
  consent_expires_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountRow = {
  id: string;
  household_id: string;
  plaid_item_id: string | null;
  plaid_account_id: string | null;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: AccountType;
  subtype: string | null;
  currency: string;
  /** Signed contribution to net worth: liabilities are stored negative. */
  current_balance_cents: number;
  available_balance_cents: number | null;
  limit_cents: number | null;
  is_asset: boolean;
  is_manual: boolean;
  is_hidden: boolean;
  include_in_net_worth: boolean;
  display_order: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountBalanceRow = {
  id: string;
  household_id: string;
  account_id: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  balance_cents: number;
  created_at: string;
};

export type CategoryGroupRow = {
  id: string;
  household_id: string;
  name: string;
  type: CategoryType;
  display_order: number;
  is_system: boolean;
  created_at: string;
};

export type CategoryRow = {
  id: string;
  household_id: string;
  group_id: string;
  name: string;
  icon: string;
  color: string | null;
  display_order: number;
  is_system: boolean;
  system_key: string | null;
  exclude_from_budget: boolean;
  rollover_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type MerchantRow = {
  id: string;
  household_id: string;
  name: string;
  logo_url: string | null;
  default_category_id: string | null;
  created_at: string;
};

export type TagRow = {
  id: string;
  household_id: string;
  name: string;
  color: string;
  created_at: string;
};

export type TransactionRow = {
  id: string;
  household_id: string;
  account_id: string;
  plaid_transaction_id: string | null;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  authorized_date: string | null;
  /** Negative = money left the account. */
  amount_cents: number;
  currency: string;
  merchant_id: string | null;
  description: string;
  original_description: string | null;
  category_id: string | null;
  notes: string | null;
  is_pending: boolean;
  is_hidden: boolean;
  needs_review: boolean;
  parent_id: string | null;
  has_splits: boolean;
  transfer_pair_id: string | null;
  plaid_category: Json | null;
  created_at: string;
  updated_at: string;
};

export type TransactionTagRow = {
  household_id: string;
  transaction_id: string;
  tag_id: string;
};

export type PropertyDetailsRow = {
  account_id: string;
  household_id: string;
  address_line: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  property_type: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_footage: number | null;
  purchase_price_cents: number | null;
  purchase_date: string | null;
  valuation_source: ValuationSource;
  last_valuation_cents: number | null;
  last_valuation_low_cents: number | null;
  last_valuation_high_cents: number | null;
  last_valued_at: string | null;
  valuation_error: string | null;
  created_at: string;
  updated_at: string;
};

export type NetWorthPointRow = {
  day: string;
  assets_cents: number;
  liabilities_cents: number;
  net_cents: number;
};

export type FinancialChartPointRow = {
  day: string;
  assets_cents: number | null;
  liabilities_cents: number | null;
  cash_cents: number | null;
  net_cents: number | null;
  cash_flow_cents: number;
};

// ------------------------------------------------------------------ database

export type Database = {
  public: {
    Tables: {
      households: TableDef<
        HouseholdRow,
        'id' | 'name' | 'timezone' | 'created_at'
      >;
      household_members: TableDef<HouseholdMemberRow, 'role' | 'created_at'>;
      profiles: TableDef<
        ProfileRow,
        'display_name' | 'currency' | 'timezone' | Timestamps
      >;
      plaid_items: TableDef<
        PlaidItemRow,
        | 'id'
        | 'plaid_institution_id'
        | 'institution_name'
        | 'institution_logo'
        | 'plaid_phone_number'
        | 'status'
        | 'error_code'
        | 'error_message'
        | 'transactions_cursor'
        | 'last_synced_at'
        | 'consent_expires_at'
        | Timestamps
      >;
      accounts: TableDef<
        AccountRow,
        | 'id'
        | 'plaid_item_id'
        | 'plaid_account_id'
        | 'official_name'
        | 'mask'
        | 'type'
        | 'subtype'
        | 'currency'
        | 'current_balance_cents'
        | 'available_balance_cents'
        | 'limit_cents'
        | 'is_asset'
        | 'is_manual'
        | 'is_hidden'
        | 'include_in_net_worth'
        | 'display_order'
        | 'deleted_at'
        | Timestamps
      >;
      account_balances: TableDef<AccountBalanceRow, 'id' | 'created_at'>;
      category_groups: TableDef<
        CategoryGroupRow,
        'id' | 'type' | 'display_order' | 'is_system' | 'created_at'
      >;
      categories: TableDef<
        CategoryRow,
        | 'id'
        | 'icon'
        | 'color'
        | 'display_order'
        | 'is_system'
        | 'system_key'
        | 'exclude_from_budget'
        | 'rollover_enabled'
        | Timestamps
      >;
      merchants: TableDef<
        MerchantRow,
        'id' | 'logo_url' | 'default_category_id' | 'created_at'
      >;
      tags: TableDef<TagRow, 'id' | 'color' | 'created_at'>;
      transactions: TableDef<
        TransactionRow,
        | 'id'
        | 'plaid_transaction_id'
        | 'authorized_date'
        | 'currency'
        | 'merchant_id'
        | 'original_description'
        | 'category_id'
        | 'notes'
        | 'is_pending'
        | 'is_hidden'
        | 'needs_review'
        | 'parent_id'
        | 'has_splits'
        | 'transfer_pair_id'
        | 'plaid_category'
        | Timestamps
      >;
      transaction_tags: TableDef<TransactionTagRow>;
      property_details: TableDef<
        PropertyDetailsRow,
        | 'city'
        | 'state'
        | 'postal_code'
        | 'formatted_address'
        | 'latitude'
        | 'longitude'
        | 'property_type'
        | 'bedrooms'
        | 'bathrooms'
        | 'square_footage'
        | 'purchase_price_cents'
        | 'purchase_date'
        | 'valuation_source'
        | 'last_valuation_cents'
        | 'last_valuation_low_cents'
        | 'last_valuation_high_cents'
        | 'last_valued_at'
        | 'valuation_error'
        | Timestamps
      >;
    };
    Views: Record<string, never>;
    Functions: {
      financial_chart_series: {
        Args: { p_start: string; p_end: string };
        Returns: FinancialChartPointRow[];
      };
      net_worth_series: {
        Args: { p_start: string; p_end: string };
        Returns: NetWorthPointRow[];
      };
      set_reporting_timezone: {
        Args: { p_timezone: string };
        Returns: undefined;
      };
    };
    Enums: {
      account_type: AccountType;
      valuation_source: ValuationSource;
      category_type: CategoryType;
      plaid_item_status: PlaidItemStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
