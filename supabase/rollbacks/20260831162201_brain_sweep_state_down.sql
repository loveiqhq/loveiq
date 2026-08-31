-- Compensating migration for 20260831170000_brain_sweep_state.
--
-- Safe to drop: the table holds only "when did this source last sweep". Losing it
-- makes every source eligible to sweep on its next run, which is the pre-migration
-- behaviour -- more disk IO, never data loss.
drop table if exists public.brain_sweep_state;
