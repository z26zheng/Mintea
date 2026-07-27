import { Text, View } from 'react-native';

import { Card, Screen, Title } from './ui';

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <View className="flex-row gap-3 mb-5">
      <View className="w-7 h-7 rounded-full bg-mint-600 items-center justify-center mt-0.5">
        <Text className="text-white text-sm font-bold">{n}</Text>
      </View>
      <View className="flex-1">
        <Text className="text-base font-semibold text-ink-900 dark:text-ink-50 mb-1">
          {title}
        </Text>
        {children}
      </View>
    </View>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-mono text-xs text-ink-700 dark:text-ink-200 bg-ink-100 dark:bg-ink-800 px-2 py-1.5 rounded-lg mt-1">
      {children}
    </Text>
  );
}

/**
 * Shown when EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY are missing. A first run
 * without configuration is expected, so it gets a real screen rather than a
 * thrown error.
 */
export function SetupScreen() {
  return (
    <Screen scroll>
      <View className="p-6">
        <Text className="text-4xl mb-3">🍵</Text>
        <Title>Finish setting up Mintea</Title>
        <Text className="text-base text-ink-500 dark:text-ink-400 mt-2 mb-6">
          The app needs a Supabase project before it can sign anyone in.
        </Text>

        <Card className="p-5">
          <Step n={1} title="Create a Supabase project">
            <Text className="text-sm text-ink-500 dark:text-ink-400">
              Any free-tier project works. Copy the Project URL and the anon
              (public) key from Project Settings → API.
            </Text>
          </Step>

          <Step n={2} title="Add them to the app">
            <Text className="text-sm text-ink-500 dark:text-ink-400">
              Copy the example env file and fill in both values:
            </Text>
            <Code>cp apps/mintea/.env.example apps/mintea/.env.local</Code>
          </Step>

          <Step n={3} title="Apply the database schema">
            <Text className="text-sm text-ink-500 dark:text-ink-400">
              Links the project and pushes the migrations in supabase/migrations:
            </Text>
            <Code>supabase link --project-ref YOUR_REF{'\n'}supabase db push</Code>
          </Step>

          <Step n={4} title="Deploy the Plaid functions">
            <Text className="text-sm text-ink-500 dark:text-ink-400">
              Needed to link real accounts. You can skip this and add manual
              accounts first.
            </Text>
            <Code>
              supabase secrets set --env-file supabase/.env.local{'\n'}
              supabase functions deploy
            </Code>
          </Step>

          <Step n={5} title="Restart the dev server">
            <Text className="text-sm text-ink-500 dark:text-ink-400">
              Environment variables are read at build time, so the bundler needs
              a restart to pick them up.
            </Text>
            <Code>npm run web</Code>
          </Step>
        </Card>

        <Text className="text-xs text-ink-400 dark:text-ink-500 mt-6 leading-5">
          The anon key is meant to be public — it grants nothing without a
          signed-in session, because every table is protected by row level
          security. The Plaid secret and the service-role key stay in Edge
          Function secrets and never reach this bundle.
        </Text>
      </View>
    </Screen>
  );
}
