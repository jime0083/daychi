import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Prettierと競合するフォーマット系ルールを無効化(必ず最後に置く)
  eslintConfigPrettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright実行時の生成物(P-004対応)。src/ および e2e/ 配下の実コードは対象外にしない
    "e2e/artifacts/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
