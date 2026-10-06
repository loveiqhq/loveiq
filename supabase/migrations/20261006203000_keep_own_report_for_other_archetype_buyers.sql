-- A single report bought for ANOTHER archetype stops opening the buyer's own report
-- (fix/report-archetype-purchases, 2026-10-06). Until now it did: the report API gated the
-- reader's own archetype on the strongest plan across every payment, whatever archetype a
-- payment was for. So a reader whose only purchases were for other archetypes has been
-- able to read their own report too. Write that access down as their own tier, so nothing
-- they could already read disappears when the fix ships.
--
-- Production held two such readers on 2026-10-06, both from May 2026. One bought "Approval
-- Seeker", a retired archetype name, which was most likely their own report under the old
-- name. Idempotent: upsert_archetype_tier keeps the highest tier, and a reader whose own
-- archetype is already in archetype_tiers is skipped.
with own as (
  select pr.id as personal_report_id,
         (select coalesce(nullif(sr.v5_primary_archetype, ''), sr.primary_archetype)
            from public.scoring_result sr
           where sr.survey_submission_id = pr.survey_submission_id
           order by sr.id desc limit 1) as archetype,
         coalesce(pr.archetype_tiers, '{}'::jsonb) as tiers
    from public.personal_report pr
), paid as (
  select p.personal_report_id,
         bool_or(p.metadata->>'plan' in ('all_reports', 'core')
                 or (p.metadata->>'plan' in ('full_report', 'essentials')
                     and coalesce(p.metadata->>'archetype', '') in ('', o.archetype))) as covers_own,
         bool_or(p.metadata->>'plan' = 'full_report'
                 and coalesce(p.metadata->>'archetype', '') not in ('', o.archetype)) as other_full,
         bool_or(p.metadata->>'plan' = 'essentials'
                 and coalesce(p.metadata->>'archetype', '') not in ('', o.archetype)) as other_essentials
    from public.payment p
    join own o on o.personal_report_id = p.personal_report_id
   where p.status = 'succeeded'
   group by p.personal_report_id, o.archetype
)
select public.upsert_archetype_tier(
         o.personal_report_id,
         o.archetype,
         case when paid.other_full then 'full_report' else 'essentials' end
       )
  from paid
  join own o on o.personal_report_id = paid.personal_report_id
 where o.archetype is not null
   and not paid.covers_own
   and (paid.other_full or paid.other_essentials)
   and not (o.tiers ? o.archetype);
