"use client";
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useAdminFetch } from "./hooks/useAdminFetch";
import { getCsrfToken } from "@/lib/csrf-client";
import { hasSegmentConditionValue } from "@/lib/admin/segment-preview";
import SegmentDeltaMonitor from "./SegmentDeltaMonitor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Condition {
  id: string;
  field: string;
  operator: string;
  value: string | number | boolean;
}

interface Segment {
  id: number;
  admin_email: string;
  name: string;
  description: string | null;
  rules: { logic: "and" | "or"; conditions: Condition[] };
  is_shared: boolean;
  match_count: number | null;
  created_at: string;
  updated_at: string;
}

interface SegmentsData {
  segments: Segment[];
}

interface PreviewData {
  count: number;
  sample: Array<{
    id: number;
    email: string;
    archetype: string | null;
    created_date_time: string;
    status: string;
    duration_ms: number | null;
  }>;
}

// ---------------------------------------------------------------------------
// Field / Operator config
// ---------------------------------------------------------------------------

const FIELDS = [
  {
    value: "archetype",
    label: "Archetype (V4)",
    type: "select",
    options: [
      "Romantic Idealist",
      "Pragmatic Partner",
      "Passionate Explorer",
      "Mindful Connector",
      "Adventurous Spirit",
      "Devoted Companion",
      "Independent Thinker",
      "Balanced Harmonizer",
      "Sensual Naturalist",
      "Empathic Nurturer",
      "Creative Visionary",
      "Grounded Realist",
      "Playful Enthusiast",
      "Spiritual Seeker",
    ],
  },
  {
    value: "v5_archetype",
    label: "Archetype (V5)",
    type: "select",
    options: [
      "Romantic Idealist",
      "Pragmatic Partner",
      "Passionate Explorer",
      "Mindful Connector",
      "Adventurous Spirit",
      "Devoted Companion",
      "Independent Thinker",
      "Balanced Harmonizer",
      "Sensual Naturalist",
      "Empathic Nurturer",
      "Creative Visionary",
      "Grounded Realist",
      "Playful Enthusiast",
      "Spiritual Seeker",
    ],
  },
  {
    value: "gender",
    label: "Gender",
    type: "select",
    options: ["Male", "Female", "Non-binary", "Prefer not to say", "Other"],
  },
  {
    value: "relationship_status",
    label: "Relationship Status",
    type: "select",
    options: [
      "Single",
      "In a relationship",
      "Married",
      "Divorced",
      "Widowed",
      "It's complicated",
      "Other",
    ],
  },
  {
    value: "status",
    label: "Submission Status",
    type: "select",
    options: ["completed", "abandoned"],
  },
  { value: "duration_ms", label: "Duration (ms)", type: "number" },
  { value: "created_date_time", label: "Date", type: "date" },
  { value: "utm_source", label: "UTM Source", type: "text" },
  { value: "utm_medium", label: "UTM Medium", type: "text" },
  { value: "country", label: "Country", type: "text" },
  { value: "sexual_orientation", label: "Sexual Orientation", type: "text" },
  { value: "has_report", label: "Has Report", type: "boolean" },
  { value: "has_payment", label: "Has Payment", type: "boolean" },
] as const;

const OPERATORS: Record<string, { value: string; label: string }[]> = {
  select: [
    { value: "eq", label: "is" },
    { value: "neq", label: "is not" },
  ],
  text: [
    { value: "eq", label: "equals" },
    { value: "neq", label: "not equals" },
    { value: "contains", label: "contains" },
  ],
  number: [
    { value: "eq", label: "=" },
    { value: "lt", label: "<" },
    { value: "gt", label: ">" },
    { value: "lte", label: "<=" },
    { value: "gte", label: ">=" },
  ],
  date: [
    { value: "gte", label: "on or after" },
    { value: "lte", label: "on or before" },
  ],
  boolean: [{ value: "eq", label: "is" }],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFieldConfig(fieldValue: string) {
  return FIELDS.find((f) => f.value === fieldValue) ?? FIELDS[0];
}

function defaultOperatorForField(fieldValue: string): string {
  const field = getFieldConfig(fieldValue);
  const ops = OPERATORS[field.type] ?? OPERATORS.text;
  return ops[0].value;
}

function defaultValueForField(fieldValue: string): string | number | boolean {
  const field = getFieldConfig(fieldValue);
  if (field.type === "boolean") return true;
  if (field.type === "number") return 0;
  return "";
}

function maskEmail(email: string): string {
  const atIdx = email.indexOf("@");
  if (atIdx < 0) return email.slice(0, 3) + "***";
  const local = email.slice(0, atIdx);
  const domain = email.slice(atIdx + 1);
  return local.slice(0, 3) + "***@" + domain;
}

let conditionCounter = 0;
function nextConditionId(): string {
  conditionCounter += 1;
  return `cond-${Date.now()}-${conditionCounter}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: Condition;
  onChange: (updated: Condition) => void;
  onRemove: () => void;
}) {
  const field = getFieldConfig(condition.field);
  const operators = OPERATORS[field.type] ?? OPERATORS.text;

  function handleFieldChange(newField: string) {
    onChange({
      ...condition,
      field: newField,
      operator: defaultOperatorForField(newField),
      value: defaultValueForField(newField),
    });
  }

  function handleOperatorChange(op: string) {
    onChange({ ...condition, operator: op });
  }

  function renderValueInput() {
    if (field.type === "boolean") {
      return (
        <select
          value={String(condition.value)}
          onChange={(e) => onChange({ ...condition, value: e.target.value === "true" })}
          className="h-9 rounded-lg border border-white/10 bg-surface px-3 text-sm text-text-primary focus:border-accent-purple/50 focus:outline-none"
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      );
    }
    if (field.type === "select" && "options" in field) {
      return (
        <select
          value={String(condition.value)}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          className="h-9 rounded-lg border border-white/10 bg-surface px-3 text-sm text-text-primary focus:border-accent-purple/50 focus:outline-none"
        >
          <option value="">Select…</option>
          {(field.options as readonly string[]).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );
    }
    if (field.type === "number") {
      return (
        <input
          type="number"
          value={String(condition.value)}
          onChange={(e) =>
            onChange({ ...condition, value: e.target.value === "" ? 0 : Number(e.target.value) })
          }
          className="h-9 w-32 rounded-lg border border-white/10 bg-surface px-3 text-sm text-text-primary placeholder-text-muted focus:border-accent-purple/50 focus:outline-none"
          placeholder="0"
        />
      );
    }
    if (field.type === "date") {
      return (
        <input
          type="date"
          value={String(condition.value)}
          onChange={(e) => onChange({ ...condition, value: e.target.value })}
          className="h-9 rounded-lg border border-white/10 bg-surface px-3 text-sm text-text-primary focus:border-accent-purple/50 focus:outline-none"
        />
      );
    }
    // text
    return (
      <input
        type="text"
        value={String(condition.value)}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
        className="h-9 min-w-[120px] rounded-lg border border-white/10 bg-surface px-3 text-sm text-text-primary placeholder-text-muted focus:border-accent-purple/50 focus:outline-none"
        placeholder="Value"
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Field */}
      <select
        value={condition.field}
        onChange={(e) => handleFieldChange(e.target.value)}
        className="h-9 rounded-lg border border-white/10 bg-surface px-3 text-sm text-text-primary focus:border-accent-purple/50 focus:outline-none"
      >
        {FIELDS.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {/* Operator */}
      <select
        value={condition.operator}
        onChange={(e) => handleOperatorChange(e.target.value)}
        className="h-9 rounded-lg border border-white/10 bg-surface px-3 text-sm text-text-primary focus:border-accent-purple/50 focus:outline-none"
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {/* Value */}
      {renderValueInput()}

      {/* Remove */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove condition"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-text-muted transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SegmentBuilder() {
  // List data
  const {
    data: segmentsData,
    loading: listLoading,
    error: listError,
    refetch,
  } = useAdminFetch<SegmentsData>("/api/admin/segments");

  // Edit state
  const [editing, setEditing] = useState<Segment | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formLogic, setFormLogic] = useState<"and" | "or">("and");
  const [formConditions, setFormConditions] = useState<Condition[]>([]);
  const [formShared, setFormShared] = useState(false);

  // Preview
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Actions
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Delete confirmation state
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Debounce timer ref
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // -------------------------------------------------------------------------
  // Preview (debounced)
  // -------------------------------------------------------------------------

  const triggerPreview = useCallback((logic: "and" | "or", conditions: Condition[]) => {
    if (previewTimerRef.current !== null) {
      clearTimeout(previewTimerRef.current);
    }

    const filledConditions = conditions.filter((c) => hasSegmentConditionValue(c.value));

    if (filledConditions.length === 0) {
      setPreviewData(null);
      return;
    }

    previewTimerRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/admin/segments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify({
            action: "preview",
            rules: { logic, conditions: filledConditions },
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            (body as { error?: string } | null)?.error ?? `Request failed: ${res.status}`
          );
        }
        const json = (await res.json()) as PreviewData;
        setPreviewData(json);
      } catch {
        setPreviewData(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 500);
  }, []);

  // Re-run preview whenever conditions or logic change while in edit mode
  useEffect(() => {
    if (editing === null) return;
    triggerPreview(formLogic, formConditions);
    return () => {
      if (previewTimerRef.current !== null) {
        clearTimeout(previewTimerRef.current);
      }
    };
  }, [formLogic, formConditions, editing, triggerPreview]);

  // -------------------------------------------------------------------------
  // Condition helpers
  // -------------------------------------------------------------------------

  const addCondition = useCallback(() => {
    setFormConditions((prev) => [
      ...prev,
      {
        id: nextConditionId(),
        field: "archetype",
        operator: "eq",
        value: "",
      },
    ]);
  }, []);

  const removeCondition = useCallback((id: string) => {
    setFormConditions((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateCondition = useCallback((updated: Condition) => {
    setFormConditions((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }, []);

  // -------------------------------------------------------------------------
  // Edit helpers
  // -------------------------------------------------------------------------

  function startNew() {
    setIsNew(true);
    setEditing({} as Segment); // non-null signals edit mode
    setFormName("");
    setFormDescription("");
    setFormLogic("and");
    setFormConditions([]);
    setFormShared(false);
    setPreviewData(null);
    setActionError(null);
  }

  function startEdit(segment: Segment) {
    setIsNew(false);
    setEditing(segment);
    setFormName(segment.name);
    setFormDescription(segment.description ?? "");
    setFormLogic(segment.rules.logic);
    setFormConditions(
      segment.rules.conditions.map((c) => ({ ...c, id: c.id ?? nextConditionId() }))
    );
    setFormShared(segment.is_shared);
    setPreviewData(null);
    setActionError(null);
  }

  function cancelEdit() {
    setEditing(null);
    setActionError(null);
    setPreviewData(null);
    if (previewTimerRef.current !== null) {
      clearTimeout(previewTimerRef.current);
    }
  }

  // -------------------------------------------------------------------------
  // Save
  // -------------------------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (!formName.trim()) {
      setActionError("Name is required.");
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      const payload = isNew
        ? {
            action: "create",
            name: formName.trim(),
            description: formDescription.trim() || null,
            rules: { logic: formLogic, conditions: formConditions },
            is_shared: formShared,
          }
        : {
            action: "update",
            segmentId: (editing as Segment).id,
            name: formName.trim(),
            description: formDescription.trim() || null,
            rules: { logic: formLogic, conditions: formConditions },
            is_shared: formShared,
          };

      const res = await fetch("/api/admin/segments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": getCsrfToken(),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body as { error?: string } | null)?.error ?? `Request failed: ${res.status}`
        );
      }

      refetch();
      cancelEdit();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to save segment.");
    } finally {
      setSubmitting(false);
    }
  }, [isNew, formName, formDescription, formLogic, formConditions, formShared, editing, refetch]);

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  const handleDelete = useCallback(
    async (segmentId: number) => {
      setDeletingId(segmentId);
      setActionError(null);
      try {
        const res = await fetch("/api/admin/segments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": getCsrfToken(),
          },
          body: JSON.stringify({ action: "delete", segmentId }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(
            (body as { error?: string } | null)?.error ?? `Request failed: ${res.status}`
          );
        }

        refetch();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Failed to delete segment.");
      } finally {
        setDeletingId(null);
      }
    },
    [refetch]
  );

  // -------------------------------------------------------------------------
  // Memoised segments list
  // -------------------------------------------------------------------------

  const segments = useMemo(() => segmentsData?.segments ?? [], [segmentsData]);

  // -------------------------------------------------------------------------
  // Edit view
  // -------------------------------------------------------------------------

  if (editing !== null) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl text-text-primary">
            {isNew ? "New Segment" : "Edit Segment"}
          </h2>
          <button
            type="button"
            onClick={cancelEdit}
            className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-text-muted transition hover:bg-white/10 hover:text-text-primary"
          >
            Back to List
          </button>
        </div>

        {/* Action error */}
        {actionError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            {actionError}
          </div>
        )}

        {/* Form card */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-primary">
              Segment Name <span className="text-accent-orange">*</span>
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Completed – Romantic Idealist"
              className="w-full rounded-lg border border-white/10 bg-surface px-4 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent-purple/50 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-primary">
              Description <span className="text-xs font-normal text-text-muted">(optional)</span>
            </label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Brief description of this segment's purpose"
              className="w-full rounded-lg border border-white/10 bg-surface px-4 py-2 text-sm text-text-primary placeholder-text-muted focus:border-accent-purple/50 focus:outline-none"
            />
          </div>

          {/* Logic toggle */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-text-primary">Condition Logic</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormLogic("and")}
                className={`rounded-lg border px-5 py-2 text-sm font-medium transition ${
                  formLogic === "and"
                    ? "border-accent-purple/60 bg-accent-purple/20 text-accent-purple"
                    : "border-white/10 bg-white/5 text-text-muted hover:bg-white/10 hover:text-text-primary"
                }`}
              >
                AND
              </button>
              <button
                type="button"
                onClick={() => setFormLogic("or")}
                className={`rounded-lg border px-5 py-2 text-sm font-medium transition ${
                  formLogic === "or"
                    ? "border-accent-orange/60 bg-accent-orange/20 text-accent-orange"
                    : "border-white/10 bg-white/5 text-text-muted hover:bg-white/10 hover:text-text-primary"
                }`}
              >
                OR
              </button>
              <span className="self-center text-xs text-text-muted">
                {formLogic === "and" ? "All conditions must match" : "Any condition can match"}
              </span>
            </div>
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-primary">Conditions</label>

            {formConditions.length === 0 && (
              <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-sm text-text-muted">
                No conditions yet. Add one below.
              </p>
            )}

            <div className="space-y-2">
              {formConditions.map((condition, idx) => (
                <div key={condition.id} className="flex items-start gap-3">
                  {formConditions.length > 1 && (
                    <span className="mt-2 shrink-0 text-xs font-medium text-text-muted w-8 text-right">
                      {idx === 0 ? "IF" : formLogic === "and" ? "AND" : "OR"}
                    </span>
                  )}
                  {formConditions.length === 1 && (
                    <span className="mt-2 shrink-0 text-xs font-medium text-text-muted w-8 text-right">
                      IF
                    </span>
                  )}
                  <ConditionRow
                    condition={condition}
                    onChange={updateCondition}
                    onRemove={() => removeCondition(condition.id)}
                  />
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addCondition}
              className="mt-1 flex items-center gap-1.5 rounded-lg border border-dashed border-white/20 bg-transparent px-4 py-2 text-sm text-text-muted transition hover:border-accent-purple/40 hover:text-accent-purple"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Condition
            </button>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="block text-sm font-medium text-text-primary">Preview</label>
              {previewLoading && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-purple border-t-transparent" />
              )}
              {previewData !== null && !previewLoading && (
                <span className="rounded-full bg-accent-purple/20 px-2.5 py-0.5 text-xs font-medium text-accent-purple">
                  {previewData.count.toLocaleString()} match
                  {previewData.count !== 1 ? "es" : ""}
                </span>
              )}
            </div>

            <p className="text-xs text-text-muted">
              Preview and saved match counts use the refreshed analytics snapshot, so new
              submissions can take a few minutes to appear.
            </p>

            {previewData !== null && previewData.sample.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-muted">
                        Email
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-muted">
                        Archetype
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-muted">
                        Status
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-text-muted">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.sample.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-white/5 transition hover:bg-white/5"
                      >
                        <td className="px-4 py-2 text-text-muted font-mono text-xs">
                          {maskEmail(row.email)}
                        </td>
                        <td className="px-4 py-2 text-text-primary text-xs">
                          {row.archetype ?? "—"}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              row.status === "completed"
                                ? "bg-green-500/20 text-green-400"
                                : "bg-yellow-500/20 text-yellow-400"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-text-muted text-xs">
                          {row.created_date_time
                            ? new Date(row.created_date_time).toLocaleDateString()
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewData.count > previewData.sample.length && (
                  <p className="px-4 py-2 text-xs text-text-muted">
                    Showing {previewData.sample.length} of {previewData.count.toLocaleString()}{" "}
                    matches
                  </p>
                )}
              </div>
            )}

            {previewData !== null && previewData.sample.length === 0 && !previewLoading && (
              <p className="text-sm text-text-muted">No submissions match these conditions.</p>
            )}
          </div>

          {/* Shared */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="checkbox"
              aria-checked={formShared}
              onClick={() => setFormShared((v) => !v)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                formShared ? "bg-accent-purple" : "bg-white/10"
              }`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                  formShared ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
            <label className="text-sm text-text-primary">Share with all admins</label>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={cancelEdit}
            className="rounded-lg border border-white/10 bg-white/5 px-5 py-2 text-sm font-medium text-text-muted transition hover:bg-white/10 hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={submitting}
            className="rounded-lg bg-accent-purple px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Save Segment"}
          </button>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // List view
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <SegmentDeltaMonitor />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-xl text-text-primary">Segments</h2>
        <button
          type="button"
          onClick={startNew}
          className="rounded-lg bg-accent-purple px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-purple/80"
        >
          New Segment
        </button>
      </div>

      {/* Action error (from delete) */}
      {actionError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {actionError}
        </div>
      )}

      {/* Loading */}
      {listLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-purple border-t-transparent" />
        </div>
      )}

      {/* Error */}
      {!listLoading && listError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-300">
          {listError}
        </div>
      )}

      {/* Empty state */}
      {!listLoading && !listError && segments.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/10 p-10 text-center">
          <p className="text-sm text-text-muted">
            No segments yet. Create one to start filtering submissions across dashboards.
          </p>
        </div>
      )}

      {/* Segment grid */}
      {!listLoading && segments.length > 0 && (
        <div className="grid grid-cols-1 gap-4">
          {segments.map((segment) => (
            <div
              key={segment.id}
              className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3"
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-text-primary truncate">{segment.name}</span>
                    {segment.is_shared && (
                      <span className="shrink-0 rounded-full bg-accent-purple/20 px-2 py-0.5 text-xs font-medium text-accent-purple">
                        Shared
                      </span>
                    )}
                    {segment.match_count !== null && (
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-xs text-text-muted">
                        {segment.match_count.toLocaleString()} match
                        {segment.match_count !== 1 ? "es" : ""}
                      </span>
                    )}
                  </div>
                  {segment.description && (
                    <p className="text-sm text-text-muted">{segment.description}</p>
                  )}
                </div>

                {/* Card actions */}
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(segment)}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-text-muted transition hover:bg-white/10 hover:text-text-primary"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(segment.id)}
                    disabled={deletingId === segment.id}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-text-muted transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {deletingId === segment.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>

              {/* Conditions summary */}
              {segment.rules.conditions.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-text-muted uppercase tracking-wide">
                    {segment.rules.logic === "and" ? "All of" : "Any of"}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {segment.rules.conditions.slice(0, 4).map((c, idx) => {
                      const fieldCfg = getFieldConfig(c.field);
                      return (
                        <span
                          key={c.id ?? idx}
                          className="rounded-full border border-white/10 bg-surface px-2.5 py-0.5 text-xs text-text-muted"
                        >
                          {fieldCfg.label} {c.operator} {String(c.value)}
                        </span>
                      );
                    })}
                    {segment.rules.conditions.length > 4 && (
                      <span className="rounded-full border border-white/10 bg-surface px-2.5 py-0.5 text-xs text-text-muted">
                        +{segment.rules.conditions.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Footer meta */}
              <div className="flex items-center gap-3 pt-1 text-xs text-text-muted border-t border-white/5">
                <span>{segment.admin_email}</span>
                <span>
                  {new Date(segment.created_at).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
