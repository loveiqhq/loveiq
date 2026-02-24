import nextConfig from "eslint-config-next";
import securityPlugin from "eslint-plugin-security";
import noSecretsPlugin from "eslint-plugin-no-secrets";

const eslintConfig = [
  {
    ignores: ["scripts/*-output.js", ".next/**", "node_modules/**", "out/**"],
  },
  ...nextConfig,
  {
    // eslint-plugin-security: detect unsafe patterns in server-side code
    files: ["app/api/**/*.ts", "lib/**/*.ts", "proxy.ts"],
    plugins: { security: securityPlugin },
    rules: securityPlugin.configs.recommended.rules,
  },
  {
    // eslint-plugin-no-secrets: detect hardcoded credentials in server-side code
    files: ["app/api/**/*.ts", "lib/**/*.ts", "proxy.ts"],
    plugins: { "no-secrets": noSecretsPlugin },
    rules: { "no-secrets/no-secrets": "error" },
  },
  {
    // Security-focused rules for API routes and sensitive code
    files: ["app/api/**/*.ts", "lib/**/*.ts", "proxy.ts"],
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

      // Enforce consistent error handling
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],

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
    files: ["components/**/*.{ts,tsx}", "app/**/page.tsx", "app/**/layout.tsx"],
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
