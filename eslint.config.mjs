import { defineConfig } from "eslint/config";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

export default defineConfig([
  // ESLint 9: .eslintignore ist deprecated -> ignorieren direkt hier
  {
    ignores: [".next/**", "node_modules/**", "dist/**", "coverage/**", "scripts/**"],
  },

  ...coreWebVitals,
  ...typescript,

  /**
   * Builder (Admin Forms) ist aktuell bewusst pragmatisch gehalten (MVP/WIP).
   * -> Wir lassen den Rest strict, aber entspannen nur hier.
   */
  {
    files: [
      "src/app/(admin)/admin/forms/**/builder/**/*.{ts,tsx}",
      "src/app/api/admin/v1/forms/**/builder/**/*.{ts,tsx}",
      "src/app/api/admin/v1/forms/**/delete/route.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
]);
