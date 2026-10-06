-- P-02: payment.personal_report_id ON DELETE SET NULL
--
-- Problem: fk_payment_personal_report defaults to ON DELETE RESTRICT, which
-- blocks DSAR deletion of `personal_report` rows whenever a payment row
-- references them. The DSAR helper in features/admin/server/data-subject.ts
-- masks this with an early-bail ("payment FK exists, app_user retained"),
-- but the masking means personal_report rows for paying users are never
-- actually deleted — a GDPR Art. 17 gap.
--
-- Fix: change the FK action to SET NULL. The payment row stays (accounting/
-- tax retention is a separate legal obligation under §147 AO and §257 HGB),
-- but its `personal_report_id` becomes NULL, freeing the parent personal_report
-- to be deleted. Downstream code already handles payment.personal_report_id
-- being nullable (the column is declared nullable; the schema only enforces
-- the reference when set).

BEGIN;

ALTER TABLE payment
  DROP CONSTRAINT fk_payment_personal_report;

ALTER TABLE payment
  ADD CONSTRAINT fk_payment_personal_report
  FOREIGN KEY (personal_report_id)
  REFERENCES personal_report(id)
  ON DELETE SET NULL;

COMMIT;
