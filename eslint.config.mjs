import nextPlugin from "@next/eslint-plugin-next";
import tsParser from "@typescript-eslint/parser";

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
