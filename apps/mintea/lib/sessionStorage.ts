import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  chunkKey,
  joinChunks,
  parseChunkCount,
  splitIntoChunks,
} from '@mintea/core';

/** The subset of the Storage contract Supabase's auth client actually uses. */
export type SessionStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

/**
 * The session contains a bearer token for every account the user has linked.
 * Keeping it out of iCloud Keychain backups means a restored device cannot
 * silently carry someone's banking session onto new hardware.
 *
 * `WHEN_UNLOCKED` rather than `AFTER_FIRST_UNLOCK` because Mintea has no
 * background work: the token is only ever needed while the user is holding an
 * unlocked phone. Revisit this if background sync is added.
 */
const KEYCHAIN_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

async function readChunked(key: string): Promise<string | null> {
  const count = parseChunkCount(
    await SecureStore.getItemAsync(key, KEYCHAIN_OPTIONS),
  );
  if (count === null) return null;

  const chunks = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      SecureStore.getItemAsync(chunkKey(key, index), KEYCHAIN_OPTIONS),
    ),
  );

  const value = joinChunks(chunks);

  // A chunk went missing — an interrupted write, or a keystore the OS reset.
  // Clear the remains so the next write starts from a known state.
  if (value === null) await deleteChunked(key, count);

  return value;
}

async function deleteChunked(key: string, count: number): Promise<void> {
  await SecureStore.deleteItemAsync(key, KEYCHAIN_OPTIONS);
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      SecureStore.deleteItemAsync(chunkKey(key, index), KEYCHAIN_OPTIONS),
    ),
  );
}

async function writeChunked(key: string, value: string): Promise<void> {
  const previous =
    parseChunkCount(await SecureStore.getItemAsync(key, KEYCHAIN_OPTIONS)) ?? 0;
  const chunks = splitIntoChunks(value);

  // Drop the count before touching the chunks. If the app dies mid-write the
  // session reads back as absent, which costs a sign-in; the alternative is a
  // count that promises more chunks than exist.
  await SecureStore.deleteItemAsync(key, KEYCHAIN_OPTIONS);

  await Promise.all(
    chunks.map((chunk, index) =>
      SecureStore.setItemAsync(chunkKey(key, index), chunk, KEYCHAIN_OPTIONS),
    ),
  );

  // A shorter session leaves orphans behind that would otherwise survive until
  // the next longer one overwrote them.
  if (previous > chunks.length) {
    await Promise.all(
      Array.from({ length: previous - chunks.length }, (_, offset) =>
        SecureStore.deleteItemAsync(
          chunkKey(key, chunks.length + offset),
          KEYCHAIN_OPTIONS,
        ),
      ),
    );
  }

  await SecureStore.setItemAsync(key, String(chunks.length), KEYCHAIN_OPTIONS);
}

/**
 * Moves a session written by an older build out of AsyncStorage.
 *
 * Native sessions used to live in plain AsyncStorage — unencrypted, and on
 * Android readable by anything that can reach the app's data directory. An
 * upgrade must not leave that copy sitting on disk, so the first read after
 * the upgrade relocates it and deletes the original.
 */
async function adoptLegacySession(key: string): Promise<string | null> {
  const legacy = await AsyncStorage.getItem(key);
  if (legacy === null) return null;

  await writeChunked(key, legacy);
  await AsyncStorage.removeItem(key);

  return legacy;
}

const secureSessionStorage: SessionStorage = {
  async getItem(key) {
    try {
      const stored = await readChunked(key);
      if (stored !== null) return stored;

      return await adoptLegacySession(key);
    } catch {
      // A keystore failure must not stop the app from starting. Reporting "no
      // session" sends the user to sign-in, which they can act on.
      return null;
    }
  },

  async setItem(key, value) {
    await writeChunked(key, value);
  },

  async removeItem(key) {
    const count =
      parseChunkCount(await SecureStore.getItemAsync(key, KEYCHAIN_OPTIONS)) ??
      0;

    await deleteChunked(key, count);
    // Sign-out has to clear the pre-upgrade copy too.
    await AsyncStorage.removeItem(key);
  },
};

/**
 * Web keeps using AsyncStorage, whose web implementation is localStorage.
 * There is no device keystore in a browser, and the session there is already
 * scoped by origin.
 */
export const sessionStorage: SessionStorage =
  Platform.OS === 'web' ? AsyncStorage : secureSessionStorage;
