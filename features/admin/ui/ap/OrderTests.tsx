import type { SurveyQuestions } from "@features/admin/server/ap/survey";

import { Pills } from "./kit";
import { orderTests, type SurveyOrder } from "./surveyOrders";

/**
 * The question orders as two stacked tests (Mark, sync of 25 Nov 2026): a row per test, its name
 * and when it ran, then a Control and a Variant pill (surveyOrders.ts `orderTests`). A pill picks
 * the order every chart, funnel and table on the page counts in; the new order is both the
 * question order test's Variant and the Survey 2.0 test's Control, so both its pills light up.
 */
export function OrderTests({
  label,
  q,
  value,
  onChange,
}: {
  label: string;
  q: SurveyQuestions;
  value: SurveyOrder;
  onChange: (order: SurveyOrder) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      {orderTests(q).map((t) => (
        <div key={t.name} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="min-w-[190px] text-[13px] font-bold text-ap-ink">
            {t.name} <span className="font-normal text-ap-muted">· {t.when}</span>
          </span>
          <Pills label={t.name} value={value} onChange={onChange} options={t.options} />
        </div>
      ))}
    </div>
  );
}
