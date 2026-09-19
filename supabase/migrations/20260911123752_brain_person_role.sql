-- What each colleague does, so the brain can answer "who is the CEO".
--
-- Measured 2026-09-11: across ~22,000 indexed chunks the corpus states a colleague's
-- role exactly three times, and never the CEO's. "who is the CEO" returned forty
-- chunks, every one of them about some other company's chief executive -- Supabase's
-- founder, a testimonial, an investor newsletter. The most basic question a new
-- joiner asks had no answer anywhere.
--
-- The roles themselves are NOT in this file and must never be: this repository is
-- public, and a role is attached to a named person. They are written straight to
-- the table, which is private. This migration only makes the column exist.
--
-- Nullable on purpose. An unknown role must read as unknown rather than as a guess,
-- and `role_confidence` records that a role was reported with a caveat -- one was.
alter table brain_person
  add column if not exists role text,
  add column if not exists role_confidence text
    check (role_confidence is null or role_confidence in ('confirmed', 'unconfirmed'));

comment on column brain_person.role is
  'Free-text job role. Private: never mirror this into the public repository.';
comment on column brain_person.role_confidence is
  'confirmed = stated by someone who would know; unconfirmed = reported with a caveat, say so when answering.';
