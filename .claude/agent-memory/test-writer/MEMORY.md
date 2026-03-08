# test-writer Agent Memory

## Project Testing Facts

- Unit tests: Vitest v4, `npm test`, files in `__tests__/`
- Coverage thresholds (vitest.config.ts): lines/statements/functions=70%, branches=60%
- Coverage scope: `lib/**/*.ts`, `app/api/**/*.ts`, `proxy.ts`
- Zod version: ^4.3.6 (use z.nullable() not .nullish() for fields explicitly typed as X|null)
- `@/` alias maps to project root (configured in both tsconfig.json and vitest.config.ts)

## Known Pre-existing Test Failures (do NOT fix — out of scope)

- `__tests__/components/survey/SurveyEngine.test.tsx` — 4 tests fail with
  `vi.mocked(...).mockReturnValueOnce is not a function`. Pre-existed before any contract work.
  Hand off to ui-section agent.

## Contract Tests

- Location: `__tests__/contracts/` (new directory, not mirroring source)
- Schema file: `__tests__/contracts/supabase-contracts.ts` — 13 Zod schemas
- Test file: `__tests__/contracts/supabase-contracts.test.ts` — 59 tests, all passing
- Pattern: `z.array(z.object({...}))` for PostgREST array responses,
  `z.object({...})` for RPC responses that return a single object
- See `patterns.md` for full contract schema reference

## Test Patterns (API Route Tests)

- Mock order: logger → csrf → ratelimit → fetch-with-timeout → external SDKs
  (all mocks MUST be declared before imports)
- Helper functions: `allowCsrf()`, `allowRateLimit()`, `allowCooldown()`, then mock Supabase
- Test order: CSRF rejection → rate limit rejection → validation rejection → happy path
- `vi.resetAllMocks()` in `beforeEach`

## Supabase Mock Shape Notes

- `WaitlistIdempotencyResponseSchema`: id is `z.string()` (route casts `as Array<{id:string}>`)
- `WaitlistInsertResponseSchema`: id is `z.number()` (actual Supabase serial PK)
- Both SubmissionList and SubmissionDetail use same row shape (array; detail takes index 0)
- ExportAnswer has no `id` or `answered_at`, and `survey_question` has no `question` field
- BehaviorStats RPC returns camelCase keys (dropOff, avgTimePerQuestion, etc.) NOT snake_case

## Detailed References

- Contract schemas: `__tests__/contracts/supabase-contracts.ts`
- Test patterns: `patterns.md`
