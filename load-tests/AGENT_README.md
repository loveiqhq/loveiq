# load-tests/

Load and performance tests using k6. Requires k6 installed locally or runs in CI via `.github/workflows/load-test.yml`.

## Key Conventions

- Three test profiles: `load.js` (gradual ramp-up), `smoke.js` (single VU sanity check), `spike.js` (sudden traffic surge).
- Run locally with `k6 run load-tests/<script>.js`.

## Test Files

| Script     | Profile         | Purpose                  |
| ---------- | --------------- | ------------------------ |
| `load.js`  | Gradual ramp-up | Sustained load testing   |
| `smoke.js` | Single VU       | Quick sanity check       |
| `spike.js` | Sudden surge    | Traffic spike resilience |
