/**
 * Fixture, not a probe. Exists so scripts/verify-ux-findings.mjs --selftest can
 * exercise the 0/1/3 exit-code contract it depends on, without launching a
 * browser or touching production.
 *
 * That mapping is the single point where "reproduced" is decided, and it had no
 * test: a probe that merely failed to load a page was briefly indistinguishable
 * from a confirmed defect, which is how a draft PR could have been opened
 * asserting something nobody saw.
 *
 *   SELFTEST_EXIT=3 SELFTEST_SAY=INCONCLUSIVE node scripts/probes/_selftest-exit.mjs
 *
 * The leading underscore keeps it out of the probe listings; it asserts nothing
 * about the product and must never be added to a criterion.
 */
if (process.env.SELFTEST_SAY) console.log(process.env.SELFTEST_SAY);
process.exit(Number(process.env.SELFTEST_EXIT ?? 0));
