# Contributing to LoveIQ

## Getting Started

```bash
npm run setup    # Install deps + create .env.local
npm run dev      # Start dev server at http://localhost:3000
```

## Development Workflow

1. Create a branch from `main`
2. Make your changes
3. Run `npm run check` (lint + test + build)
4. Open a PR against `main`

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new landing section
fix: resolve contact form validation errors
chore: update dependencies
docs: update API documentation
style: format code with prettier
test: add waitlist route tests
ci: pin GitHub Actions to SHA
```

## Code Standards

- **TypeScript** strict mode is enabled
- **Use `@/` alias** for cross-directory imports (`@/lib/...`, `@/components/...`), relative imports for same directory
- **ESLint** must pass (`npm run lint`)
- **Prettier** formats code on commit (via husky + lint-staged)
- Follow existing patterns in `components/landing/` for new sections

## Testing

- Write tests for new utility functions in `__tests__/lib/`
- Write tests for new API routes in `__tests__/api/`
- Run `npm test` before pushing
- Target 70%+ line coverage (enforced in `vitest.config.ts`)

## Security

- Never commit secrets or `.env.local`
- All API routes must include CSRF verification, rate limiting, and Zod validation
- Keep error messages generic (no internal details)
- If modifying CSP headers (`proxy.ts`), test in both dev and production builds
- See [SECURITY.md](SECURITY.md) for full guidelines
- See [.github/SECURITY_CHECKLIST.md](.github/SECURITY_CHECKLIST.md) for the developer security checklist

## PR Checklist

- [ ] `npm run check` passes (lint + test + build)
- [ ] Changes tested manually in browser
- [ ] No secrets committed
- [ ] Security controls preserved (see [Security Checklist](.github/SECURITY_CHECKLIST.md))
- [ ] Documentation updated if needed
