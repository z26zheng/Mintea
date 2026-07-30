import { useState, type ComponentProps } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import {
  accountExportColumns,
  fetchAccountsForExport,
  fetchTransactionsForExport,
  profileQuery,
  safeFileName,
  toCsv,
  transactionExportColumns,
  EXPORT_ROW_LIMIT,
  type DateRange,
} from "@mintea/core";

import { useClient } from "../../lib/auth";
import { useBreakpoint } from "../../lib/breakpoints";
import { useDismiss } from "../../lib/useDismiss";
import { useTheme } from "../../lib/theme";
import { canSaveFiles, saveTextFile } from "../../lib/saveFile";
import {
  Badge,
  Button,
  Card,
  Divider,
  ErrorNotice,
  IconBadge,
  ModalHeader,
  Screen,
} from "../../components/ui";
import { RequireAuth } from "../../components/RequireAuth";

type DataSet = "transactions" | "accounts";
type Period = "all" | "1Y" | "YTD" | "90D";
type IconName = ComponentProps<typeof Ionicons>["name"];

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "all", label: "Everything" },
  { value: "1Y", label: "Last 12 months" },
  { value: "YTD", label: "This year" },
  { value: "90D", label: "Last 90 days" },
];

/** Uses the household calendar, so a range means the same thing as elsewhere. */
function rangeFor(period: Period, todayIso: string): DateRange | undefined {
  if (period === "all") return undefined;

  const today = new Date(`${todayIso}T00:00:00Z`);
  const start = new Date(today);

  if (period === "1Y") start.setUTCFullYear(start.getUTCFullYear() - 1);
  if (period === "90D") start.setUTCDate(start.getUTCDate() - 90);
  if (period === "YTD") {
    start.setUTCMonth(0);
    start.setUTCDate(1);
  }

  return { start: start.toISOString().slice(0, 10), end: todayIso };
}

function Row({
  label,
  description,
  icon,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
  icon: IconName;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      className={`min-h-16 flex-row items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mint-500 ${
        selected
          ? "bg-mint-50 dark:bg-mint-950/50"
          : "hover:bg-ink-50 active:bg-ink-100 dark:hover:bg-ink-800/70"
      }`}
    >
      <IconBadge name={icon} size={38} tone={selected ? "accent" : "neutral"} />
      <View className="min-w-0 flex-1">
        <Text
          className={`text-base ${
            selected
              ? "font-semibold text-mint-600 dark:text-mint-400"
              : "text-ink-900 dark:text-ink-50"
          }`}
        >
          {label}
        </Text>
        {description ? (
          <Text className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
            {description}
          </Text>
        ) : null}
      </View>

      <View
        className={`h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
          selected
            ? "border-mint-600 bg-mint-600"
            : "border-ink-300 dark:border-ink-600"
        }`}
      >
        {selected ? (
          <Ionicons name="checkmark" size={15} color="#fff" />
        ) : (
          <Ionicons name="ellipse-outline" size={10} color={colors.textMuted} />
        )}
      </View>
    </Pressable>
  );
}

function Export() {
  const client = useClient();
  const dismiss = useDismiss("/(tabs)/settings");
  const { isLarge } = useBreakpoint();
  const { colors } = useTheme();

  const profile = useQuery(profileQuery(client));

  const [dataSet, setDataSet] = useState<DataSet>("transactions");
  const [period, setPeriod] = useState<Period>("all");
  const [loaded, setLoaded] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const todayIso = new Date().toLocaleDateString("en-CA", {
    timeZone: profile.data?.timezone || "UTC",
  });

  const run = useMutation({
    mutationFn: async () => {
      setError(null);
      setNotice(null);
      setLoaded(0);

      if (dataSet === "accounts") {
        const accounts = await fetchAccountsForExport(client);
        const csv = toCsv(accounts, accountExportColumns());
        await saveTextFile(
          safeFileName(`mintea-accounts-${todayIso}`, "csv"),
          csv,
        );
        return accounts.length;
      }

      const range = rangeFor(period, todayIso);
      const transactions = await fetchTransactionsForExport(client, {
        filters: range ? { startDate: range.start, endDate: range.end } : {},
        onProgress: ({ loaded: count }) => setLoaded(count),
      });

      const csv = toCsv(transactions, transactionExportColumns());
      await saveTextFile(
        safeFileName(`mintea-transactions-${todayIso}`, "csv"),
        csv,
      );
      return transactions.length;
    },
    onSuccess: (count: number) => {
      setNotice(
        count === 0
          ? "Nothing matched, so the file has only its header row."
          : count >= EXPORT_ROW_LIMIT
            ? `Exported the first ${EXPORT_ROW_LIMIT.toLocaleString()} rows, which is the per-file limit. Narrow the date range to get the rest.`
            : `Exported ${count.toLocaleString()} ${
                dataSet === "accounts" ? "accounts" : "transactions"
              }.`,
      );
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : "Could not export"),
  });

  return (
    <Screen maxWidth="5xl">
      <ModalHeader
        title="Export data"
        subtitle="Download a clean copy of your Mintea records"
        onClose={dismiss}
      />

      <ScrollView
        contentContainerClassName="p-4 pb-16"
        showsVerticalScrollIndicator={false}
      >
        {error ? <ErrorNotice message={error} /> : null}

        {!canSaveFiles ? (
          <Card className="mb-4 flex-row items-start gap-3 p-4">
            <IconBadge name="desktop-outline" tone="neutral" />
            <View className="min-w-0 flex-1">
              <Text className="font-semibold text-ink-900 dark:text-ink-50">
                Continue on the web
              </Text>
              <Text className="mt-1 text-sm leading-5 text-ink-600 dark:text-ink-300">
                File downloads are only available in the web app right now.
              </Text>
            </View>
          </Card>
        ) : null}

        <View className={`gap-4 ${isLarge ? "flex-row items-start" : ""}`}>
          <View className={isLarge ? "w-[310px] shrink-0 gap-4" : "gap-4"}>
            <Card className="overflow-hidden">
              <View className="h-1 bg-mint-500" />
              <View className="p-4">
                <IconBadge name="download-outline" size={44} />
                <Text className="mt-4 text-lg font-semibold text-ink-900 dark:text-ink-50">
                  Your data, ready to use
                </Text>
                <Text className="mt-1 text-sm leading-5 text-ink-500 dark:text-ink-400">
                  Download a portable CSV for a spreadsheet, backup, or move to
                  another service. Mintea does not alter anything during export.
                </Text>
                <View className="mt-4 flex-row flex-wrap gap-2">
                  <Badge label="CSV" tone="neutral" />
                  <Badge label="Portable" tone="accent" />
                  <Badge label="Read only" tone="neutral" />
                </View>
              </View>
            </Card>

            <Card className="p-4">
              <View className="flex-row items-start gap-3">
                <IconBadge
                  name="lock-closed-outline"
                  size={38}
                  tone="neutral"
                />
                <View className="min-w-0 flex-1">
                  <Text className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                    Treat exports as private
                  </Text>
                  <Text className="mt-1 text-xs leading-4 text-ink-500 dark:text-ink-400">
                    Files can include account names, balances, notes, and full
                    transaction history. Store and share them carefully.
                  </Text>
                </View>
              </View>
            </Card>
          </View>

          <View className={isLarge ? "min-w-0 flex-1 gap-4" : "gap-4"}>
            <Card className="overflow-hidden">
              <View className="p-4">
                <Text className="text-xs font-semibold uppercase tracking-wider text-mint-700 dark:text-mint-300">
                  1 · Choose your data
                </Text>
                <Text className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">
                  What would you like to export?
                </Text>
              </View>
              <Divider />
              <View accessibilityRole="radiogroup">
                <Row
                  icon="receipt-outline"
                  label="Transactions"
                  description="Date, merchant, category, account, tags, notes and amount"
                  selected={dataSet === "transactions"}
                  onPress={() => setDataSet("transactions")}
                />
                <Divider />
                <Row
                  icon="wallet-outline"
                  label="Accounts"
                  description="Balances and institutions, including hidden accounts"
                  selected={dataSet === "accounts"}
                  onPress={() => setDataSet("accounts")}
                />
              </View>
            </Card>

            {dataSet === "transactions" ? (
              <Card className="p-4">
                <Text className="text-xs font-semibold uppercase tracking-wider text-mint-700 dark:text-mint-300">
                  2 · Choose a date range
                </Text>
                <Text className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">
                  How much history do you need?
                </Text>
                <View
                  accessibilityRole="radiogroup"
                  className="mt-4 flex-row flex-wrap gap-2"
                >
                  {PERIODS.map((option) => {
                    const selected = period === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => setPeriod(option.value)}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected }}
                        aria-checked={selected}
                        className={`min-h-11 min-w-32 flex-1 items-center justify-center rounded-xl border px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 ${
                          selected
                            ? "border-mint-600 bg-mint-600"
                            : "border-ink-200 bg-ink-50 hover:bg-ink-100 dark:border-ink-700 dark:bg-ink-800 dark:hover:bg-ink-700"
                        }`}
                      >
                        <Text
                          className={`text-sm font-semibold ${
                            selected
                              ? "text-white"
                              : "text-ink-700 dark:text-ink-200"
                          }`}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Card>
            ) : null}

            <Card className="overflow-hidden">
              <View className="h-1 bg-mint-500" />
              <View className="p-4">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <Text className="text-xs font-semibold uppercase tracking-wider text-mint-700 dark:text-mint-300">
                      {dataSet === "transactions" ? "3" : "2"} · Download
                    </Text>
                    <Text className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-50">
                      {dataSet === "accounts"
                        ? "All accounts"
                        : PERIODS.find((option) => option.value === period)
                            ?.label}
                    </Text>
                    <Text className="mt-1 text-sm leading-5 text-ink-500 dark:text-ink-400">
                      {dataSet === "accounts"
                        ? "One row per account, including hidden records."
                        : "One row per matching transaction, up to 10,000 rows per file."}
                    </Text>
                  </View>
                  <IconBadge
                    name={
                      dataSet === "accounts"
                        ? "wallet-outline"
                        : "receipt-outline"
                    }
                    size={42}
                  />
                </View>

                <Button
                  label={
                    run.isPending && loaded > 0
                      ? `Preparing ${loaded.toLocaleString()} rows…`
                      : "Download CSV"
                  }
                  onPress={() => run.mutate()}
                  loading={run.isPending}
                  disabled={!canSaveFiles}
                  className="mt-5"
                />

                {notice ? (
                  <View className="mt-4 flex-row items-start gap-2 rounded-xl bg-mint-50 p-3 dark:bg-mint-950/40">
                    <Ionicons
                      name="checkmark-circle"
                      size={19}
                      color={colors.accent}
                    />
                    <Text
                      accessibilityLiveRegion="polite"
                      className="min-w-0 flex-1 text-sm text-mint-800 dark:text-mint-200"
                    >
                      {notice}
                    </Text>
                  </View>
                ) : null}

                <Text className="mt-3 text-xs leading-4 text-ink-400 dark:text-ink-500">
                  Amounts are signed, so money out is negative and the column
                  sums to your net. Dates use your household time zone
                  {profile.data?.timezone ? ` (${profile.data.timezone})` : ""}.
                </Text>
              </View>
            </Card>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

export default function ExportRoute() {
  return (
    <RequireAuth>
      <Export />
    </RequireAuth>
  );
}
