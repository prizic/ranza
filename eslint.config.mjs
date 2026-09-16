import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/.next/**", "**/.turbo/**", "**/coverage/**", "**/dist/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    // A Nest module class is a decorator carrying metadata, not a class anybody
    // instantiates. The rule is right everywhere else and this is the one place
    // an empty class is the framework's own shape.
    files: ["apps/worker/src/**/*.module.ts"],
    rules: { "@typescript-eslint/no-extraneous-class": "off" },
  },
);
