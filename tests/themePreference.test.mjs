import assert from "node:assert/strict";
import test from "node:test";

import {
  isThemePreference,
  resolveThemePreference,
} from "../apps/mintea/lib/themePreference.ts";

test("accepts only supported theme preferences", () => {
  assert.equal(isThemePreference("system"), true);
  assert.equal(isThemePreference("light"), true);
  assert.equal(isThemePreference("dark"), true);
  assert.equal(isThemePreference("sepia"), false);
  assert.equal(isThemePreference(null), false);
});

test("an explicit preference wins over the device appearance", () => {
  assert.equal(resolveThemePreference("light", "dark"), "light");
  assert.equal(resolveThemePreference("dark", "light"), "dark");
});

test("system follows the device and safely defaults to light", () => {
  assert.equal(resolveThemePreference("system", "dark"), "dark");
  assert.equal(resolveThemePreference("system", "light"), "light");
  assert.equal(resolveThemePreference("system", null), "light");
});
