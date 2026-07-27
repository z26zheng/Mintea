/**
 * Maps Plaid's Personal Finance Category taxonomy onto the default Mintea
 * category tree seeded at signup.
 *
 * Resolution order: exact `detailed` match → `primary` fallback → the
 * household's `uncategorized` system category. Names are matched against the
 * user's own categories, so a renamed category simply stops auto-matching
 * rather than breaking ingest — and once the rules engine lands (Phase 2), user
 * rules run after this and win.
 */

const DETAILED: Record<string, string> = {
  // Income
  INCOME_WAGES: 'Paycheck',
  INCOME_DIVIDENDS: 'Dividends',
  INCOME_INTEREST_EARNED: 'Interest',
  INCOME_RETIREMENT_PENSION: 'Other Income',
  INCOME_TAX_REFUND: 'Other Income',
  INCOME_UNEMPLOYMENT: 'Other Income',
  INCOME_OTHER_INCOME: 'Other Income',

  // Transfers
  TRANSFER_IN_INVESTMENT_AND_RETIREMENT_FUNDS: 'Investments',
  TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS: 'Investments',

  // Loans
  LOAN_PAYMENTS_CAR_PAYMENT: 'Auto Payment',
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: 'Credit Card Payment',
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: 'Mortgage',
  LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT: 'Loan Repayment',
  LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT: 'Loan Repayment',
  LOAN_PAYMENTS_OTHER_PAYMENT: 'Loan Repayment',

  // Entertainment
  ENTERTAINMENT_TV_AND_MOVIES: 'Movies',
  ENTERTAINMENT_MUSIC_AND_AUDIO: 'Music',
  ENTERTAINMENT_VIDEO_GAMES: 'Games',
  ENTERTAINMENT_CASINOS_AND_GAMBLING: 'Events',
  ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS: 'Events',
  ENTERTAINMENT_OTHER_ENTERTAINMENT: 'Events',

  // Food & drink
  FOOD_AND_DRINK_GROCERIES: 'Groceries',
  FOOD_AND_DRINK_RESTAURANT: 'Restaurants',
  FOOD_AND_DRINK_FAST_FOOD: 'Restaurants',
  FOOD_AND_DRINK_VENDING_MACHINES: 'Restaurants',
  FOOD_AND_DRINK_COFFEE: 'Coffee Shops',
  FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR: 'Alcohol & Bars',
  FOOD_AND_DRINK_OTHER_FOOD_AND_DRINK: 'Restaurants',

  // General merchandise
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: 'Clothing',
  GENERAL_MERCHANDISE_ELECTRONICS: 'Electronics',
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: 'Gifts',
  GENERAL_MERCHANDISE_PET_SUPPLIES: 'Pets',
  GENERAL_MERCHANDISE_SPORTING_GOODS: 'Hobbies',
  GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS: 'Hobbies',
  GENERAL_MERCHANDISE_CONVENIENCE_STORES: 'Groceries',
  GENERAL_MERCHANDISE_SUPERSTORES: 'Groceries',

  // Home
  HOME_IMPROVEMENT_FURNITURE: 'Home & Garden',
  HOME_IMPROVEMENT_HARDWARE: 'Home Improvement',
  HOME_IMPROVEMENT_REPAIR_AND_MAINTENANCE: 'Home Improvement',
  HOME_IMPROVEMENT_SECURITY: 'Home Improvement',
  HOME_IMPROVEMENT_OTHER_HOME_IMPROVEMENT: 'Home Improvement',

  // Medical
  MEDICAL_PRIMARY_CARE: 'Doctor',
  MEDICAL_EYE_CARE: 'Doctor',
  MEDICAL_NURSING_CARE: 'Doctor',
  MEDICAL_DENTAL_CARE: 'Dentist',
  MEDICAL_PHARMACIES_AND_SUPPLEMENTS: 'Pharmacy',
  MEDICAL_VETERINARY_SERVICES: 'Pets',
  MEDICAL_OTHER_MEDICAL: 'Doctor',

  // Personal care
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: 'Fitness',
  PERSONAL_CARE_HAIR_AND_BEAUTY: 'Personal Care',
  PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING: 'Personal Care',
  PERSONAL_CARE_OTHER_PERSONAL_CARE: 'Personal Care',

  // Services
  GENERAL_SERVICES_CHILDCARE: 'Childcare',
  GENERAL_SERVICES_EDUCATION: 'Education',
  GENERAL_SERVICES_AUTOMOTIVE: 'Auto Maintenance',
  GENERAL_SERVICES_ACCOUNTING_AND_FINANCIAL_PLANNING: 'Financial Fees',

  // Government & non-profit
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: 'Charity',
  GOVERNMENT_AND_NON_PROFIT_TAX_PAYMENT: 'Taxes',
  GOVERNMENT_AND_NON_PROFIT_GOVERNMENT_DEPARTMENTS_AND_AGENCIES: 'Taxes',

  // Transportation
  TRANSPORTATION_GAS: 'Gas',
  TRANSPORTATION_PARKING: 'Parking',
  TRANSPORTATION_TOLLS: 'Parking',
  TRANSPORTATION_PUBLIC_TRANSIT: 'Public Transit',
  TRANSPORTATION_BIKES_AND_SCOOTERS: 'Public Transit',
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: 'Rideshare',

  // Travel
  TRAVEL_FLIGHTS: 'Flights',
  TRAVEL_LODGING: 'Hotels',
  TRAVEL_RENTAL_CARS: 'Vacation',
  TRAVEL_OTHER_TRAVEL: 'Vacation',

  // Rent & utilities
  RENT_AND_UTILITIES_RENT: 'Rent',
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: 'Electric',
  RENT_AND_UTILITIES_WATER: 'Gas & Water',
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: 'Internet & Cable',
  RENT_AND_UTILITIES_TELEPHONE: 'Phone',
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: 'Trash',
  RENT_AND_UTILITIES_OTHER_UTILITIES: 'Gas & Water',
};

const PRIMARY: Record<string, string> = {
  INCOME: 'Other Income',
  TRANSFER_IN: 'Transfer',
  TRANSFER_OUT: 'Transfer',
  LOAN_PAYMENTS: 'Loan Repayment',
  BANK_FEES: 'Financial Fees',
  ENTERTAINMENT: 'Events',
  FOOD_AND_DRINK: 'Restaurants',
  GENERAL_MERCHANDISE: 'Miscellaneous',
  HOME_IMPROVEMENT: 'Home Improvement',
  MEDICAL: 'Doctor',
  PERSONAL_CARE: 'Personal Care',
  GENERAL_SERVICES: 'Miscellaneous',
  GOVERNMENT_AND_NON_PROFIT: 'Taxes',
  TRANSPORTATION: 'Public Transit',
  TRAVEL: 'Vacation',
  RENT_AND_UTILITIES: 'Gas & Water',
};

export type CategoryLookup = {
  byName: Map<string, string>;
  uncategorizedId: string | null;
};

/** Builds the name → id index used to resolve a PFC value to a category row. */
export function buildCategoryLookup(
  categories: Array<{ id: string; name: string; system_key: string | null }>,
): CategoryLookup {
  const byName = new Map<string, string>();
  let uncategorizedId: string | null = null;

  for (const category of categories) {
    byName.set(category.name.toLowerCase(), category.id);
    if (category.system_key === 'uncategorized') uncategorizedId = category.id;
  }

  return { byName, uncategorizedId };
}

export function resolveCategoryId(
  pfc: { primary: string; detailed: string } | null,
  lookup: CategoryLookup,
): string | null {
  if (!pfc) return lookup.uncategorizedId;

  const candidates = [DETAILED[pfc.detailed], PRIMARY[pfc.primary]];

  for (const name of candidates) {
    if (!name) continue;
    const id = lookup.byName.get(name.toLowerCase());
    if (id) return id;
  }

  return lookup.uncategorizedId;
}
