import { defineConfig } from "eslint/config";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

export default defineConfig([
  // ESLint 9: .eslintignore ist deprecated -> ignorieren direkt hier
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "coverage/**",
      // optional: falls du Hilfsskripte hast, die du nicht linten willst:
      "scripts/**",
    ],
  },

  ...coreWebVitals,
  ...typescript,
]);
