import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assessConnection,
  deleteAccount,
  formatPlaidPhoneNumber,
  formatFullDate,
  getDeviceTimeZone,
  normalizePlaidPhoneNumber,
  plaidItemsQuery,
  profileQuery,
  removePlaidItem,
  setReportingTimezone,
  updatePlaidItemPhone,
} from "@mintea/core";

import { useAuth, useClient } from "../../lib/auth";
import { useBreakpoint } from "../../lib/breakpoints";
import { useTheme } from "../../lib/theme";
import type { ThemePreference } from "../../lib/themePreference";
import {
  Button,
  Card,
  Divider,
  ErrorNotice,
  Field,
  IconBadge,
  PageHeader,
  SettingRow,
} from "../../components/ui";
import {
  ConnectionBadge,
  ConnectionDetail,
} from "../../components/ConnectionHealth";
import { LinkAccountButton } from "../../components/PlaidLink";
import { PlaidConnectOptions } from "../../components/PlaidConnectOptions";

type IconName = React.ComponentProps<typeof Ionicons>["name"];
type SessionAction = "sign-out" | "switch-account";

/** Typed exactly, so deleting an account is never a mis-tap. */
const DELETE_CONFIRMATION = "DELETE";

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: IconName;
}> = [
  {
    value: "system",
    label: "System",
    description: "Match this device automatically.",
    icon: "phone-portrait-outline",
  },
  {
    value: "light",
    label: "Light",
    description: "Keep Mintea bright on this device.",
    icon: "sunny-outline",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Use the low-light appearance everywhere.",
    icon: "moon-outline",
  },
];

function SectionIntro({
  icon,
  title,
  description,
}: {
  icon: IconName;
  title: string;
  description: string;
}) {
  return (
    <View className="mb-3 flex-row items-center gap-3">
      <IconBadge name={icon} size={38} />
      <View className="min-w-0 flex-1">
        <Text className="text-xs font-semibold uppercase tracking-wider text-mint-700 dark:text-mint-300">
          {title}
        </Text>
        <Text className="mt-0.5 text-sm text-ink-500 dark:text-ink-400">
          {description}
        </Text>
      </View>
    </View>
  );
}

export default function Settings() {
  // Stable across renders so a connection's assessed age doesn't churn.
  const now = useMemo(() => new Date(), []);
  const client = useClient();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, signOut } = useAuth();
  const { isLarge } = useBreakpoint();
  const {
    colors,
    preference: themePreference,
    setPreference: setThemePreference,
    isReady: themeReady,
  } = useTheme();

  const profile = useQuery(profileQuery(client));
  const items = useQuery(plaidItemsQuery(client));
  const deviceTimeZone = getDeviceTimeZone();

  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmingDisconnectId, setConfirmingDisconnectId] = useState<
    string | null
  >(null);
  const [sessionAction, setSessionAction] = useState<SessionAction | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [editingPhoneItemId, setEditingPhoneItemId] = useState<string | null>(
    null,
  );
  const [plaidPhoneInput, setPlaidPhoneInput] = useState("");
  const normalizedPlaidPhone = normalizePlaidPhoneNumber(plaidPhoneInput);
  const plaidPhoneError =
    plaidPhoneInput.trim() && !normalizedPlaidPhone
      ? "Enter a valid phone number. Include + and the country code outside the US or Canada."
      : undefined;

  const timezoneMutation = useMutation({
    mutationFn: () => setReportingTimezone(client, deviceTimeZone),
    onMutate: () => setError(null),
    onSuccess: async () => {
      // The reporting date is part of every chart range, so refresh all cached
      // data after changing the household calendar.
      await queryClient.invalidateQueries();
    },
    onError: (caught) => {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update reporting time zone",
      );
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteAccount(client),
    onMutate: () => setDeleteError(null),
    onSuccess: async () => {
      // The Auth user no longer exists, so this only clears local storage —
      // `signOut` is scoped to this device and never calls the server.
      await signOut().catch(() => {});
      queryClient.clear();
      router.replace({
        pathname: "/(auth)/sign-in",
        params: { status: "signed-out" },
      });
    },
    onError: (caught) => {
      setDeleteError(
        caught instanceof Error
          ? caught.message
          : "Could not delete your account",
      );
    },
  });

  const phoneMutation = useMutation({
    mutationFn: ({
      itemId,
      phoneNumber,
    }: {
      itemId: string;
      phoneNumber: string;
    }) => updatePlaidItemPhone(client, itemId, phoneNumber),
    onMutate: () => setError(null),
    onSuccess: async () => {
      setEditingPhoneItemId(null);
      setPlaidPhoneInput("");
      await queryClient.invalidateQueries();
    },
    onError: (caught) => {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save the Plaid phone number",
      );
    },
  });

  const disconnect = async (itemId: string) => {
    setError(null);
    setRemovingId(itemId);

    try {
      await removePlaidItem(client, itemId);
      await queryClient.invalidateQueries();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not disconnect",
      );
    } finally {
      setRemovingId(null);
      setConfirmingDisconnectId(null);
    }
  };

  return (
    <ScrollView
      className="flex-1 bg-ink-50 dark:bg-ink-950"
      contentContainerClassName="pb-20"
      showsVerticalScrollIndicator={false}
    >
      <View className="w-full max-w-6xl self-center">
        <PageHeader
          eyebrow="Preferences"
          title="Settings"
          subtitle="Manage your profile, organization tools, and connected institutions."
        />

        {error ? <ErrorNotice message={error} /> : null}

        <View
          className={`gap-8 px-4 ${
            isLarge ? "flex-row items-start gap-5" : ""
          }`}
        >
          <View className={isLarge ? "min-w-0 flex-1 gap-8" : "gap-8"}>
            <View>
              <SectionIntro
                icon="person-circle-outline"
                title="Account"
                description="Your household defaults and reporting context."
              />
              <Card className="overflow-hidden">
                <SettingRow
                  label={profile.data?.display_name ?? "Your profile"}
                  description={session?.user.email ?? undefined}
                  leading={<IconBadge name="person-outline" size={34} />}
                />
                <Divider />
                <SettingRow
                  label="Currency"
                  description="Used for household totals and reports."
                  leading={<IconBadge name="cash-outline" size={34} />}
                  right={
                    <Text className="text-sm font-semibold text-ink-500 dark:text-ink-400">
                      {profile.data?.currency ?? "USD"}
                    </Text>
                  }
                />
                <Divider />
                <SettingRow
                  label="Reporting time zone"
                  description={
                    profile.data?.timezone === deviceTimeZone
                      ? "Sets the calendar day for balances and charts."
                      : `Tap to use this device: ${deviceTimeZone}`
                  }
                  leading={<IconBadge name="globe-outline" size={34} />}
                  onPress={
                    profile.data?.timezone !== deviceTimeZone &&
                    !timezoneMutation.isPending
                      ? () => timezoneMutation.mutate()
                      : undefined
                  }
                  right={
                    <Text
                      numberOfLines={1}
                      className="max-w-[35%] text-right text-xs font-medium text-ink-500 dark:text-ink-400"
                    >
                      {timezoneMutation.isPending
                        ? "Updating…"
                        : (profile.data?.timezone ?? "UTC")}
                    </Text>
                  }
                />
              </Card>
            </View>

            <View>
              <SectionIntro
                icon="contrast-outline"
                title="Appearance"
                description="Choose how Mintea looks on this device."
              />
              <Card className="overflow-hidden">
                <View accessibilityRole="radiogroup">
                  {THEME_OPTIONS.map((option, index) => {
                    const selected = themePreference === option.value;

                    return (
                      <View key={option.value}>
                        {index > 0 ? <Divider /> : null}
                        <Pressable
                          onPress={() => {
                            setError(null);
                            void setThemePreference(option.value).catch(() =>
                              setError(
                                "Could not save the appearance preference",
                              ),
                            );
                          }}
                          disabled={!themeReady}
                          accessibilityRole="radio"
                          accessibilityState={{
                            checked: selected,
                            disabled: !themeReady,
                          }}
                          aria-checked={selected}
                          className={`min-h-16 flex-row items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-mint-500 ${
                            selected
                              ? "bg-mint-50 dark:bg-mint-950/50"
                              : "hover:bg-ink-50 active:bg-ink-100 dark:hover:bg-ink-800/70"
                          } ${themeReady ? "" : "opacity-60"}`}
                        >
                          <IconBadge
                            name={option.icon}
                            size={36}
                            tone={selected ? "accent" : "neutral"}
                          />
                          <View className="min-w-0 flex-1">
                            <Text
                              className={`text-base ${
                                selected
                                  ? "font-semibold text-mint-700 dark:text-mint-300"
                                  : "text-ink-900 dark:text-ink-50"
                              }`}
                            >
                              {option.label}
                            </Text>
                            <Text className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                              {option.description}
                            </Text>
                          </View>
                          <View
                            className={`h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                              selected
                                ? "border-mint-600 bg-mint-600"
                                : "border-ink-300 dark:border-ink-600"
                            }`}
                          >
                            {selected ? (
                              <Ionicons
                                name="checkmark"
                                size={15}
                                color="#FFFFFF"
                              />
                            ) : null}
                          </View>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </Card>
              <Text className="mt-2 px-1 text-xs leading-4 text-ink-400 dark:text-ink-500">
                This preference stays on this device and does not change other
                household members’ appearance.
              </Text>
            </View>

            <View>
              <SectionIntro
                icon="color-wand-outline"
                title="Organize"
                description="Shape how transactions are categorized and automated."
              />
              <Card className="overflow-hidden">
                {[
                  {
                    label: "Categories",
                    description:
                      "Rename, add, and reorganize how spending is grouped.",
                    icon: "folder-open-outline" as IconName,
                    onPress: () => router.push("/categories"),
                  },
                  {
                    label: "Tags",
                    description:
                      "Add cross-category labels such as reimbursable.",
                    icon: "pricetags-outline" as IconName,
                    onPress: () => router.push("/tags"),
                  },
                  {
                    label: "Transaction rules",
                    description:
                      "Review automatic merchant and category cleanup.",
                    icon: "flash-outline" as IconName,
                    onPress: () => router.push("/rules" as Href),
                  },
                  {
                    label: "Export",
                    description: "Download transactions or accounts as CSV.",
                    icon: "download-outline" as IconName,
                    onPress: () => router.push("/export" as Href),
                  },
                  {
                    label: "Import",
                    description:
                      "Bring in a bank CSV without creating duplicates.",
                    icon: "cloud-upload-outline" as IconName,
                    onPress: () => router.push("/import" as Href),
                  },
                ].map((item, index) => (
                  <View key={item.label}>
                    {index > 0 ? <Divider /> : null}
                    <SettingRow
                      label={item.label}
                      description={item.description}
                      leading={<IconBadge name={item.icon} size={34} />}
                      onPress={item.onPress}
                      right={
                        <Ionicons
                          name="chevron-forward"
                          size={17}
                          color={colors.textMuted}
                        />
                      }
                    />
                  </View>
                ))}
              </Card>
            </View>

            <View>
              <SectionIntro
                icon="shield-checkmark-outline"
                title="Session"
                description="Control access on this device."
              />
              {sessionAction ? (
                <Card className="border-amber-200 p-4 dark:border-amber-900">
                  <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                    {sessionAction === "switch-account"
                      ? "Switch Mintea accounts?"
                      : "Sign out of Mintea?"}
                  </Text>
                  <Text className="mt-1 mb-4 text-sm text-ink-500 dark:text-ink-400">
                    {sessionAction === "switch-account"
                      ? "This device will sign out. Your linked accounts and data stay with this account, and you can choose another Google account or email next."
                      : "This device will sign out. Your connected accounts and data stay safely linked to your Mintea account."}
                  </Text>
                  <View className="flex-row gap-3">
                    <Button
                      label="Cancel"
                      variant="secondary"
                      onPress={() => setSessionAction(null)}
                      className="flex-1"
                    />
                    <Button
                      label={
                        signingOut
                          ? "Signing out…"
                          : sessionAction === "switch-account"
                            ? "Switch account"
                            : "Sign out"
                      }
                      variant={
                        sessionAction === "switch-account" ? "primary" : "danger"
                      }
                      disabled={signingOut}
                      onPress={async () => {
                        setSigningOut(true);
                        try {
                          // Drop cached data before the session goes so a
                          // different account never flashes the previous one.
                          await signOut();
                          queryClient.clear();
                          router.replace({
                            pathname: "/(auth)/sign-in",
                            params: {
                              status:
                                sessionAction === "switch-account"
                                  ? "switch-account"
                                  : "signed-out",
                            },
                          });
                        } catch (caught) {
                          setError(
                            caught instanceof Error
                              ? caught.message
                              : "Could not sign out",
                          );
                          setSigningOut(false);
                        }
                      }}
                      className="flex-1"
                    />
                  </View>
                </Card>
              ) : (
                <Card className="p-4">
                  <Text className="text-sm text-ink-500 dark:text-ink-400">
                    Signed in as
                  </Text>
                  <Text className="mt-0.5 text-base font-semibold text-ink-900 dark:text-ink-50">
                    {session?.user.email ?? "Your Mintea account"}
                  </Text>
                  <View className="mt-4 flex-row gap-3">
                    <Button
                      label="Switch account"
                      onPress={() => setSessionAction("switch-account")}
                      className="flex-1"
                    />
                    <Button
                      label="Sign out"
                      variant="secondary"
                      onPress={() => setSessionAction("sign-out")}
                      className="flex-1"
                    />
                  </View>
                </Card>
              )}
            </View>

            <View>
              <SectionIntro
                icon="trash-outline"
                title="Delete account"
                description="Remove your Mintea account and everything in it."
              />
              <Card className="p-4">
                {isDeletingAccount ? (
                  <>
                    <Text className="text-base font-semibold text-ink-900 dark:text-ink-50">
                      This cannot be undone
                    </Text>
                    <Text className="mt-1 text-sm text-ink-500 dark:text-ink-400">
                      Every bank connection is disconnected at Plaid, and your
                      accounts, transactions, categories, rules and properties
                      are deleted along with your sign-in. There is no export
                      afterwards and no way to restore it.
                    </Text>
                    <Field
                      label={`Type ${DELETE_CONFIRMATION} to confirm`}
                      value={deleteConfirmation}
                      onChangeText={setDeleteConfirmation}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      placeholder={DELETE_CONFIRMATION}
                      className="mt-4"
                    />
                    {deleteError ? (
                      <Text className="mt-2 text-sm text-negative">
                        {deleteError}
                      </Text>
                    ) : null}
                    <View className="mt-4 flex-row gap-3">
                      <Button
                        label="Cancel"
                        variant="secondary"
                        disabled={deleteAccountMutation.isPending}
                        onPress={() => {
                          setIsDeletingAccount(false);
                          setDeleteConfirmation("");
                          setDeleteError(null);
                        }}
                        className="flex-1"
                      />
                      <Button
                        label={
                          deleteAccountMutation.isPending
                            ? "Deleting…"
                            : "Delete account"
                        }
                        variant="danger"
                        disabled={
                          deleteConfirmation.trim().toUpperCase() !==
                            DELETE_CONFIRMATION ||
                          deleteAccountMutation.isPending
                        }
                        onPress={() => deleteAccountMutation.mutate()}
                        className="flex-1"
                      />
                    </View>
                  </>
                ) : (
                  <>
                    <Text className="text-sm text-ink-500 dark:text-ink-400">
                      Deleting your account disconnects every bank and
                      permanently removes your financial history. If you share a
                      household, the others keep their data and you simply
                      leave.
                    </Text>
                    <Button
                      label="Delete account"
                      variant="secondary"
                      onPress={() => setIsDeletingAccount(true)}
                      className="mt-4"
                    />
                  </>
                )}
              </Card>
            </View>
          </View>

          <View className={isLarge ? "min-w-0 flex-[1.15]" : ""}>
            <SectionIntro
              icon="link-outline"
              title="Connections"
              description="Health, refresh context, and Plaid profile details."
            />

            <View className="gap-3">
              {items.isPending ? (
                <Card className="p-5">
                  <Text className="text-sm text-ink-500 dark:text-ink-400">
                    Loading connections…
                  </Text>
                </Card>
              ) : items.data?.length ? (
                items.data.map((item) => {
                  const health = assessConnection(item, now);

                  return (
                    <Card key={item.id} className="overflow-hidden p-4">
                      <View className="flex-row items-start gap-3">
                        <IconBadge name="business-outline" size={40} />
                        <View className="min-w-0 flex-1">
                          <View className="flex-row items-center gap-2">
                            <Text
                              numberOfLines={1}
                              className="min-w-0 flex-1 text-base font-semibold text-ink-900 dark:text-ink-50"
                            >
                              {item.institution_name ?? "Institution"}
                            </Text>
                            <ConnectionBadge health={health} />
                          </View>
                          <ConnectionDetail health={health} />
                        </View>
                      </View>

                      <View className="mt-3 gap-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-800">
                        <View className="flex-row items-start gap-2">
                          <Ionicons
                            name="time-outline"
                            size={16}
                            color={colors.textMuted}
                          />
                          <Text className="min-w-0 flex-1 text-xs leading-4 text-ink-500 dark:text-ink-400">
                            {item.last_balance_refreshed_at
                              ? `Real-time balances refreshed ${formatFullDate(
                                  item.last_balance_refreshed_at.slice(0, 10),
                                )}`
                              : "Real-time balances have not been refreshed yet"}
                          </Text>
                        </View>
                        <View className="flex-row items-start gap-2">
                          <Ionicons
                            name="call-outline"
                            size={16}
                            color={colors.textMuted}
                          />
                          <Text className="min-w-0 flex-1 text-xs leading-4 text-ink-500 dark:text-ink-400">
                            Plaid profile:{" "}
                            {item.plaid_phone_number
                              ? formatPlaidPhoneNumber(item.plaid_phone_number)
                              : "Phone not recorded"}
                          </Text>
                        </View>
                      </View>

                      {editingPhoneItemId === item.id ? (
                        <View className="mt-4 gap-3">
                          <Field
                            label="Plaid phone number"
                            value={plaidPhoneInput}
                            onChangeText={setPlaidPhoneInput}
                            autoComplete="tel"
                            keyboardType="phone-pad"
                            textContentType="telephoneNumber"
                            placeholder="(415) 555-0010"
                            error={plaidPhoneError}
                          />
                          <View className="flex-row gap-3">
                            <Button
                              label="Cancel"
                              variant="secondary"
                              disabled={phoneMutation.isPending}
                              onPress={() => {
                                setEditingPhoneItemId(null);
                                setPlaidPhoneInput("");
                              }}
                              className="flex-1"
                            />
                            <Button
                              label={
                                phoneMutation.isPending
                                  ? "Saving…"
                                  : "Save phone"
                              }
                              disabled={
                                !normalizedPlaidPhone || phoneMutation.isPending
                              }
                              onPress={() => {
                                if (!normalizedPlaidPhone) return;
                                phoneMutation.mutate({
                                  itemId: item.id,
                                  phoneNumber: normalizedPlaidPhone,
                                });
                              }}
                              className="flex-1"
                            />
                          </View>
                        </View>
                      ) : confirmingDisconnectId === item.id ? (
                        <View className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/30">
                          <Text className="text-sm font-semibold text-red-800 dark:text-red-200">
                            Disconnect this institution?
                          </Text>
                          <Text className="mt-1 text-xs leading-4 text-red-700 dark:text-red-300">
                            Its accounts and imported history will be removed
                            from this household.
                          </Text>
                          <View className="mt-3 flex-row gap-3">
                            <Button
                              label="Cancel"
                              variant="secondary"
                              onPress={() => setConfirmingDisconnectId(null)}
                              className="flex-1"
                            />
                            <Button
                              label={
                                removingId === item.id
                                  ? "Disconnecting…"
                                  : "Disconnect"
                              }
                              variant="danger"
                              disabled={removingId === item.id}
                              onPress={() => disconnect(item.id)}
                              className="flex-1"
                            />
                          </View>
                        </View>
                      ) : (
                        <View className="mt-4 flex-row flex-wrap items-center gap-3">
                          {health.action === "reconnect" ? (
                            <View className="min-w-[150px] flex-1">
                              <LinkAccountButton
                                label="Reconnect"
                                itemId={item.id}
                                variant="secondary"
                                onLinked={() => items.refetch()}
                              />
                            </View>
                          ) : null}

                          <Pressable
                            onPress={() => {
                              setEditingPhoneItemId(item.id);
                              setPlaidPhoneInput(item.plaid_phone_number ?? "");
                            }}
                            accessibilityRole="button"
                            className="rounded-lg px-2 py-2 hover:bg-mint-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 dark:hover:bg-mint-950"
                          >
                            <Text className="text-sm font-semibold text-mint-600 dark:text-mint-400">
                              {item.plaid_phone_number
                                ? "Edit profile"
                                : "Add phone"}
                            </Text>
                          </Pressable>

                          <Pressable
                            onPress={() => setConfirmingDisconnectId(item.id)}
                            accessibilityRole="button"
                            className="rounded-lg px-2 py-2 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:hover:bg-red-950/30"
                          >
                            <Text className="text-sm font-semibold text-negative">
                              Disconnect
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </Card>
                  );
                })
              ) : (
                <Card className="items-center p-8">
                  <IconBadge name="link-outline" size={44} />
                  <Text className="mt-3 text-base font-semibold text-ink-900 dark:text-ink-50">
                    No banks connected
                  </Text>
                  <Text className="mt-1 text-center text-sm text-ink-500 dark:text-ink-400">
                    Connect an institution to keep balances and activity in
                    sync.
                  </Text>
                </Card>
              )}
            </View>

            <View className="mt-4">
              <PlaidConnectOptions primaryLabel="Connect an institution" />
            </View>
          </View>
        </View>

        <Text className="mt-10 text-center text-xs text-ink-400 dark:text-ink-500">
          Mintea 0.1.0
        </Text>
      </View>
    </ScrollView>
  );
}
