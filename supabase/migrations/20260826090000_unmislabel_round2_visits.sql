-- Round-2 landing visits were written under the RETIRED dark-landing label.
--
-- Between 2026-08-21 and 2026-08-24 the visit-recording path collapsed any
-- landing arm that was not exactly 'white' down to 'control'. `labels.ts` has
-- carried a warning about that collapse in its header the whole time; the writer
-- was fixed in recordVisit.ts on 08-24 (it now stores the raw value, defaulting
-- to 'unknown'), but the rows already written stayed wrong.
--
-- WHAT THE ROWS ACTUALLY ARE. `control` means "the original dark landing page",
-- which has not been served since it was retired on 2026-06-19. Measured:
--
--   control visits 14-19 Jun ....... 40-225/day   the dark A/B, genuinely live
--   control visits 23 Jun - 8 Jul .. 1/day, x5    returning cookie-holders
--   control visits 9 Jul - 20 Aug .. 0            six weeks of nothing
--   control visits 21-24 Aug ....... 69/64/75/63  <- these rows
--   control visits 25 Aug .......... 0            the fix has landed
--
-- The jump begins exactly on the round-2 cutover and stops exactly when the
-- writer was fixed. Over the same days submissions — which take the arm from the
-- cookie and were never collapsed — record 0 control and 9 white_prev. So these
-- are round-2 traffic, not dark-landing traffic.
--
-- WHY 'unknown' AND NOT 'white_prev'. Because per row we do not know. Post-fix
-- days show ~8% of visits legitimately carrying no landing cookie (14 of 171 on
-- 08-25), so of these 271 rows roughly 249 are white_prev and roughly 22 are
-- genuinely un-attributed — and `unique_visitor` rows use a throwaway UUID per
-- visit, so there is nothing to join on to tell them apart. Writing 'white_prev'
-- would assert a per-row fact we do not have. 'unknown' asserts only what is
-- true: not attributable.
--
-- BEHAVIOUR IS UNCHANGED. Both labels are already excluded from every per-arm
-- comparison — 'control' via `armLabel().retired` and AMBIGUOUS_VISITOR_ARM,
-- 'unknown' via `isKnownArm`. No reported number moves. What changes is that the
-- database stops claiming a retired page received traffic.
UPDATE funnel_event
   SET landing_variant = 'unknown'
 WHERE event_type = 'unique_visitor'
   AND landing_variant = 'control'
   AND day >= DATE '2026-08-21'
   AND day <= DATE '2026-08-24';
