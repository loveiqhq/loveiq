# Versions

> Owner: CODEOWNERS default
> Last verified: 2026-04-05
> Verified against: `package.json`, `.github/workflows/ci.yml`

Use this file as the canonical source for pinned framework, runtime, and test-tool versions. Other docs should link here instead of repeating version numbers inline unless the exact version is the point of the document.

## Canonical Versions

| Key           | Value    | Source of truth            | Notes                                     |
| ------------- | -------- | -------------------------- | ----------------------------------------- |
| `node`        | `20`     | `.github/workflows/ci.yml` | CI baseline and recommended local runtime |
| `next`        | `16.1.6` | `package.json`             | App Router runtime                        |
| `react`       | `19.2.4` | `package.json`             | UI runtime                                |
| `react-dom`   | `19.2.4` | `package.json`             | UI runtime                                |
| `typescript`  | `5.3.3`  | `package.json`             | Type-checking baseline                    |
| `tailwindcss` | `3.4.19` | `package.json`             | Styling system                            |
| `vitest`      | `4.0.18` | `package.json`             | Unit and integration tests                |
| `playwright`  | `1.58.2` | `package.json`             | End-to-end tests                          |
| `eslint`      | `9.39.2` | `package.json`             | Linting baseline                          |

## Update Rule

When one of these versions changes:

1. Update `package.json` or the workflow source first.
2. Update this file in the same change set.
3. Update any docs that need version-specific guidance.
4. Run `npm run docs:truth`.
