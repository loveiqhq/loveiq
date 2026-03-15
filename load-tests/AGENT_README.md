# load-tests/

> For the full file listing, see the **Repo Map** in [CLAUDE.md](../CLAUDE.md).

## Purpose

Load and performance tests using k6. Requires k6 installed locally or runs in CI via `.github/workflows/load-test.yml`.

## Key Conventions

- Three test profiles: `load.js` (gradual ramp-up), `smoke.js` (single VU sanity check), `spike.js` (sudden traffic surge).
- Run locally with `k6 run load-tests/<script>.js`.
