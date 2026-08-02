// Metro config for an npm-workspaces monorepo + NativeWind.
//
// Deliberately just the defaults plus NativeWind. Expo SDK 57's
// `getDefaultConfig` already handles workspaces — it watches the workspace root
// and resolves through both node_modules trees — so the manual `watchFolders`,
// `nodeModulesPaths` and `disableHierarchicalLookup` overrides that used to
// live here now only disagree with it. `expo-doctor` reports the disagreement,
// and `disableHierarchicalLookup: true` in particular was pinning resolution to
// two directories in a layout the default already resolves correctly.
//
// If an override is ever needed again, add the smallest one a failing
// resolution actually demonstrates, rather than a defensive set.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
