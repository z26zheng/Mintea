/// <reference types="expo/types" />

// Committed counterpart to Expo's generated `expo-env.d.ts`.
//
// That file carries the same reference — which is what declares `*.css` for
// `import '../global.css'` — but Expo gitignores it and only regenerates it on
// `expo start`, never on `expo export`. So a clean CI checkout had no CSS
// declaration and typecheck failed before it ever reached the build.
