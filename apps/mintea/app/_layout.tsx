import '../global.css';

import { useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useSystemColorScheme } from '../lib/theme';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        // Mobile apps get backgrounded constantly; refetching on every
        // foreground would hammer the API for little benefit.
        refetchOnWindowFocus: false,
      },
    },
  });
}

export default function RootLayout() {
  const [queryClient] = useState(makeQueryClient);

  useSystemColorScheme();

  const stack = (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="transaction/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="transaction/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="account/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen
        name="account/duplicates"
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="account/new" options={{ presentation: 'modal' }} />
      <Stack.Screen
        name="account/new-property"
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen name="categories/index" options={{ presentation: 'modal' }} />
      <Stack.Screen name="tags/index" options={{ presentation: 'modal' }} />
      <Stack.Screen name="rules/index" options={{ presentation: 'modal' }} />
      <Stack.Screen name="export/index" options={{ presentation: 'modal' }} />
    </Stack>
  );

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <QueryClientProvider client={queryClient}>
        {/* Without configuration there's no client to build, so the auth
            context is skipped entirely and `index` renders the setup guide. */}
        {supabase ? (
          <AuthProvider client={supabase}>{stack}</AuthProvider>
        ) : (
          stack
        )}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
