import nextConfig from "eslint-config-next";
import securityPlugin from "eslint-plugin-security";
import noSecretsPlugin from "eslint-plugin-no-secrets";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

const eslintConfig = [
  {
    ignores: [
      "scripts/*-output.js",
      ".next/**",
      "node_modules/**",
      "out/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...nextConfig,
  {
    // Type-aware rules for server-side code. no-floating-promises catches async
    // calls without await/.catch — a recurring class of silent failures in
    // API routes (e.g., logger.error not awaited inside a handler).
    files: [
      "app/api/**/*.ts",
      "features/**/server/**/*.ts",
      "features/**/logic/**/*.ts",
      "shared/**/*.ts",
      "proxy.ts",
    ],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "@typescript-eslint": tseslint },
    rules: {
      "@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true, ignoreIIFE: true }],
    },
  },
  {
    // eslint-plugin-security: detect unsafe patterns in server-side code
    files: [
      "app/api/**/*.ts",
      "features/**/server/**/*.ts",
      "features/**/logic/**/*.ts",
      "shared/**/*.ts",
      "proxy.ts",
    ],
    plugins: { security: securityPlugin },
    rules: securityPlugin.configs.recommended.rules,
  },
  {
    // eslint-plugin-no-secrets: detect hardcoded credentials in server-side code
    files: [
      "app/api/**/*.ts",
      "features/**/server/**/*.ts",
      "features/**/logic/**/*.ts",
      "shared/**/*.ts",
      "proxy.ts",
    ],
    plugins: { "no-secrets": noSecretsPlugin },
    rules: { "no-secrets/no-secrets": "error" },
  },
  {
    // Security-focused rules for API routes and sensitive code
    files: [
      "app/api/**/*.ts",
      "features/**/server/**/*.ts",
      "features/**/logic/**/*.ts",
      "shared/**/*.ts",
      "proxy.ts",
    ],
    rules: {
      // Prevent eval and related dangerous functions
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",

      // Prevent insecure randomness for security-sensitive operations
      "no-restricted-globals": [
        "error",
        {
          name: "Math.random",
          message: "Use crypto.getRandomValues() for security-sensitive random values",
        },
      ],

      // Enforce consistent error handling. Error so it blocks merges; warnings drift.
      // `warn`/`error`/`info` allowed for intentional diagnostics; raw console.log
      // is the smell we want to catch before it lands in prod bundles.
      "no-console": ["error", { allow: ["warn", "error", "info"] }],

      // Prevent dangerous patterns
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.name='fetch'][arguments.length=1]",
          message: "fetch() should include error handling and timeout",
        },
      ],
    },
  },
  {
    // Client-side security rules
    files: ["features/**/ui/**/*.{ts,tsx}", "app/**/page.tsx", "app/**/layout.tsx"],
    rules: {
      // Warn about direct process.env access in client components
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name!=/^NEXT_PUBLIC_/]",
          message: "Only NEXT_PUBLIC_* environment variables are available in client components",
        },
      ],
    },
  },
];

export default eslintConfig;
