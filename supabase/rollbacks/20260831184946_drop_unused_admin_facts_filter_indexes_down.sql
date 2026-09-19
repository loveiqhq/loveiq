-- Compensating migration: recreate the twelve filter indexes, exactly as they were.
--
-- Restore these if the admin submission browser's filters become slow -- though at
-- ~1,800 rows that is unlikely to be the cause. Definitions captured from pg_indexes
-- before the drop, so they are byte-faithful including the COALESCE/lower expressions.
CREATE INDEX admin_submission_facts_archetype_lower_idx ON public.admin_submission_facts USING btree (lower(COALESCE(archetype, ''::text)));
CREATE INDEX admin_submission_facts_country_lower_idx ON public.admin_submission_facts USING btree (lower(COALESCE(country, ''::text)));
CREATE INDEX admin_submission_facts_gender_lower_idx ON public.admin_submission_facts USING btree (lower(COALESCE(gender, ''::text)));
CREATE INDEX admin_submission_facts_has_payment_idx ON public.admin_submission_facts USING btree (has_payment);
CREATE INDEX admin_submission_facts_has_report_idx ON public.admin_submission_facts USING btree (has_report);
CREATE INDEX admin_submission_facts_relationship_status_lower_idx ON public.admin_submission_facts USING btree (lower(COALESCE(relationship_status, ''::text)));
CREATE INDEX admin_submission_facts_sexual_orientation_lower_idx ON public.admin_submission_facts USING btree (lower(COALESCE(sexual_orientation, ''::text)));
CREATE INDEX admin_submission_facts_status_lower_idx ON public.admin_submission_facts USING btree (lower(COALESCE(status, ''::text)));
CREATE INDEX admin_submission_facts_utm_medium_lower_idx ON public.admin_submission_facts USING btree (lower(COALESCE(utm_medium, ''::text)));
CREATE INDEX admin_submission_facts_utm_source_lower_idx ON public.admin_submission_facts USING btree (lower(COALESCE(utm_source, ''::text)));
CREATE INDEX admin_submission_facts_v5_archetype_lower_idx ON public.admin_submission_facts USING btree (lower(COALESCE(v5_archetype, ''::text)));
CREATE INDEX admin_submission_facts_was_resumed_idx ON public.admin_submission_facts USING btree (was_resumed);
