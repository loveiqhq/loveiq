-- survey_behavior_event.is_tablet: whether a survey step came from a tablet, so AP-Analytics
-- can show tablets beside phones and computers (Marcus's design, 2026-10-14).
--
-- device_type is NOT changed and gains no value: it is the price quote's class (iOS, Android
-- or Desktop), the pricing code reads that class, its CHECK refuses anything else (and with it
-- the whole batch of steps), and the drop-off report, the KPI week and the digests know only
-- those three. So the tablet is a column of its own, read only by the AP readers.
--
-- Set by /api/survey-tracking from the request's User-Agent and one flag the browser sends
-- (the screen takes more than one touch point): "iPad" in the User-Agent, a Mac User-Agent
-- with touch (iPadOS Safari sends a Mac User-Agent), or Android without "Mobile". Only the
-- answer is kept, never the User-Agent. NULL for steps recorded before this column and for a
-- request without a User-Agent.
--
-- APPLY BEFORE DEPLOYING THE ROUTE THAT WRITES IT: PostgREST refuses a whole insert that
-- names a column it does not know, and every survey step would be lost until it exists.

ALTER TABLE public.survey_behavior_event
  ADD COLUMN IF NOT EXISTS is_tablet boolean;

COMMENT ON COLUMN public.survey_behavior_event.is_tablet IS
  'True when the step came from a tablet (an iPad, or Android without "Mobile"), from the request User-Agent and the browser''s touch flag; device_type keeps the pricing class. NULL before the column existed and without a User-Agent.';
