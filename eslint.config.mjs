import nextPlugin from "@next/eslint-plugin-next";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";

const nextCoreWebVitals = nextPlugin.configs["core-web-vitals"];
const nextBaseConfig = {
  name: nextCoreWebVitals.name,
  plugins: nextCoreWebVitals.plugins,
  rules: {
    ...nextCoreWebVitals.rules,
    "@next/next/no-html-link-for-pages": "off"
  }
};

export default [
  {
    // The `eslint-disable` comments name rules that this config does not turn on, so none of them is "used".
    linterOptions: { reportUnusedDisableDirectives: "off" }
  },
  {
    ignores: [
      "dist/**",
      "release/**",
      ".next/**",
      "web/.next/**",
      "node_modules/**"
    ]
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    ...nextBaseConfig
  },
  {
    // The code has `eslint-disable` comments for these rules. The plugins are registered so that those comments name
    // a rule that exists. No rule of these plugins is turned on here: enabling them is a separate clean-up.
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooks
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      }
    }
  }
];
