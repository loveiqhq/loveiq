# Survey Redesign Implementation Plan

> **Status:** ON HOLD (as of 2026-03-15) — Plan created but implementation not started. Review before resuming.
>
> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the LoveIQ survey UI to match 12 Figma screens pixel-perfect for desktop/laptop, including new data fields from updated CSV.

**Architecture:** Update the survey data pipeline (CSV → script → TypeScript) to include 4 new fields (answerOptionsExplained, hoverStates, supportAndGuidance, howAnswerIsUsed). Then redesign 7 components (SurveyHeader, SurveyNav, GuidancePanel, ChoiceCard, ScaleQuestion, OpenResponseQuestion, SurveyEngine) to match Figma. Desktop-only — mobile will follow later.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 3, Manrope (sans) + Lora (serif) fonts.

---

## Figma Reference (fileKey: IdxyUUVvJSYRTpI9CYRtJI)

| Node ID  | Description                       |
| -------- | --------------------------------- |
| 4077:280 | Email empty state                 |
| 4077:142 | Email error state                 |
| 4077:214 | Email valid state                 |
| 4077:464 | Scale empty state                 |
| 4077:679 | Scale selected (value 7)          |
| 4077:548 | Scale with insight panel expanded |
| 4078:137 | Single choice empty state         |
| 4078:240 | Single choice with insight panel  |
| 4078:395 | Single choice selected state      |
| 4086:169 | Multi choice empty state          |
| 4086:274 | Multi choice selected (2 items)   |
| 4086:382 | Multi choice with insight panel   |

---

## Task 1: Update CSV and Data Pipeline

**Files:**

- Copy: `Survey (newest) - Copy of Identify_Your_Sexual_Archetype_MB.csv` → `data/survey-source.csv`
- Modify: `scripts/update-survey.js`
- Modify: `data/survey-data.ts` (auto-generated)

### Step 1: Copy the new CSV as survey-source.csv

```bash
cp "Survey (newest) - Copy of Identify_Your_Sexual_Archetype_MB.csv" data/survey-source.csv
```

### Step 2: Update `scripts/update-survey.js` to parse new CSV columns

The new CSV has these columns (in order):

1. Q_ID
2. C_ID
3. Category & chapter
4. Question
5. Answer format (was "Answer Type")
6. Answer format guidance (NEW — instructions for the input, e.g. "Enter a valid email address")
7. Default input / placeholder (NEW — explicit placeholder text)
8. Support and guidance (was "Guide (display)" — now much longer, full paragraphs)
9. Answer options (was "Answer Options")
10. Answer option(s) explained (NEW — detailed glossary per option, e.g. "1 = very dissatisfied: your current...")
11. Hover states (NEW — readable labels like "1 = Very dissatisfied · 2 = Dissatisfied · ...")
12. How this answer will be used (was "Comment" — now user-facing text)
13. Background info (NEW — usually "N/A")
14. Required

Changes to `update-survey.js`:

1. Update column name reads:
   - `row["Answer Type"]` → `row["Answer format"]`
   - `row["Answer Options"]` → `row["Answer options"]`
   - `row["Comment"]` → `row["How this answer will be used"]`
   - `row["Guide (display)"]` → `row["Support and guidance"]`
   - Add: `row["Answer option(s) explained"]`
   - Add: `row["Hover states"]`
   - Add: `row["Default input / placeholder"]`
   - Add: `row["Answer format guidance"]`
   - Add: `row["Background info"]`

2. Update `mapAnswerType()` — existing values are same ("Open response", "1-7 scale", "Single choice", "Multiple choice")

3. Update placeholder detection — use explicit `row["Default input / placeholder"]` instead of `detectPlaceholder()`. If the value is "N/A" or empty, fall back to current detection logic.

4. Add new fields to the question object:
   - `answerOptionsExplained: string` — raw text from "Answer option(s) explained"
   - `hoverStates: string` — raw text from "Hover states"
   - `howAnswerIsUsed: string` — renamed from `comment`, text from "How this answer will be used"
   - `supportAndGuidance: string` — renamed from `guide`, text from "Support and guidance"
   - Keep `guide` as alias for backward compatibility during transition (set to same value as `supportAndGuidance`)

5. Parse `answerOptionsExplained` into structured data for scale questions:
   - Scale format: "1 = label: description. 4 = label: description. 7 = label: description."
   - Parse into array: `{ value: number, label: string, description: string }[]`

6. Parse `answerOptionsExplained` for choice questions:
   - Choice format: option titles followed by colons and descriptions, separated by newlines or numbering
   - Parse into array: `{ option: string, explanation: string }[]`

7. Parse `hoverStates` for scale questions:
   - Format: "1 = Very dissatisfied · 2 = Dissatisfied · 3 = Slightly dissatisfied · ..."
   - Parse into Record<number, string>: `{ 1: "Very dissatisfied", 2: "Dissatisfied", ... }`

8. Update the `SurveyQuestion` TypeScript interface generation to include new fields.

9. For scale questions, also update `scaleLabels` parsing:
   - Old CSV: "1 = X → 7 = Y" in Answer Options
   - New CSV: "1→7" in Answer Options, labels are in "Hover states" column
   - Extract low from hover state key 1, high from hover state key 7

### Step 3: Update the `SurveyQuestion` TypeScript interface

Add to `data/survey-data.ts` interface:

```typescript
export interface AnswerOptionExplained {
  option: string;
  explanation: string;
}

export interface ScaleHoverState {
  value: number;
  label: string;
}

export interface SurveyQuestion {
  qId: string;
  cId: number;
  chapter: string;
  question: string;
  answerType: AnswerType;
  options: string[];
  required: boolean;
  guide: string; // kept for backward compat
  supportAndGuidance: string; // NEW: full support text
  scaleLabels?: { low: string; high: string };
  inputType?: "email" | "text";
  placeholder?: string;
  comment?: string; // kept for backward compat
  howAnswerIsUsed?: string; // NEW: user-facing text
  answerOptionsExplained?: AnswerOptionExplained[]; // NEW: parsed explanations
  hoverStates?: Record<number, string>; // NEW: scale hover labels
  formatGuidance?: string; // NEW: input format instruction
}
```

### Step 4: Run the updated script

```bash
node scripts/update-survey.js
```

Expected: "Written data/survey-data.ts" with ~90 questions and new fields populated.

### Step 5: Verify build still works

```bash
npm run build
```

Expected: Build succeeds. TypeScript may show warnings if components reference old field names — those will be fixed in subsequent tasks.

### Step 6: Commit

```bash
git add data/survey-source.csv scripts/update-survey.js data/survey-data.ts
git commit -m "feat(survey): update data pipeline for new CSV columns

Add support for answerOptionsExplained, hoverStates, supportAndGuidance,
howAnswerIsUsed, and formatGuidance fields from updated survey CSV."
```

---

## Task 2: Redesign SurveyHeader

**Files:**

- Modify: `components/survey/SurveyHeader.tsx`

**Figma reference:** All 12 screens show the same header pattern:

- Left side: "PROGRESS" label in uppercase tracking-widest white/40
- Right side: Purple pill containing: percentage text + clock icon + "~X min left"
- Below: Full-width progress bar (purple fill on dark track)
- No chapter badge (removed)
- No "Pause / Exit" button in header (it's elsewhere or removed)

### Step 1: Rewrite SurveyHeader

Replace entire component with new layout matching Figma:

```tsx
"use client";

import type { FC } from "react";

interface SurveyHeaderProps {
  progress: number;
  onPause: () => void;
}

const TOTAL_MINUTES = 15;

const ClockIcon: FC = () => (
  <svg
    aria-hidden
    className="h-3.5 w-3.5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const SurveyHeader: FC<SurveyHeaderProps> = ({ progress, onPause }) => {
  const minutesLeft = Math.ceil((TOTAL_MINUTES * (100 - progress)) / 100);

  return (
    <header className="flex flex-col gap-3">
      {/* Top row: PROGRESS label + purple pill + pause */}
      <div className="flex items-center justify-between">
        <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40">
          Progress
        </span>

        <div className="flex items-center gap-3">
          {/* Purple pill with percentage + clock + time */}
          <div className="flex items-center gap-2 rounded-full border border-[rgba(167,139,250,0.2)] bg-[rgba(167,139,250,0.08)] px-3.5 py-1.5">
            <span className="font-sans text-[13px] font-semibold text-[#a78bfa]">{progress}%</span>
            {progress < 100 && (
              <>
                <span className="text-white/20">|</span>
                <div className="flex items-center gap-1.5 text-white/40">
                  <ClockIcon />
                  <span className="font-sans text-[12px] font-medium">~{minutesLeft} min left</span>
                </div>
              </>
            )}
          </div>

          {/* Pause button */}
          <button
            type="button"
            onClick={onPause}
            className="rounded-full border border-white/10 px-4 py-1.5 font-sans text-[12px] font-medium text-white/40 transition hover:border-white/20 hover:text-white/60"
          >
            Pause
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="relative h-[5px] w-full overflow-hidden rounded-full bg-white/8">
        <div
          className="h-full rounded-full bg-[#a78bfa] transition-all duration-500 ease-out"
          style={{ width: `${Math.max(progress, 1)}%` }}
        />
      </div>
    </header>
  );
};

export default SurveyHeader;
```

Key changes from current:

- Removed `chapter` prop (chapter badge removed from header in Figma)
- Added purple pill with percentage + clock icon + time estimate
- Progress bar is now a thinner line below
- "Pause / Exit" simplified to "Pause"
- Layout: single row with PROGRESS left, pill+pause right, bar below

### Step 2: Update SurveyEngine to pass updated props

In `components/survey/SurveyEngine.tsx`, update the SurveyHeader usage:

```tsx
// Old:
<SurveyHeader chapter={question.chapter} progress={progress} onPause={handlePause} />

// New:
<SurveyHeader progress={progress} onPause={handlePause} />
```

Remove `chapter` from the SurveyHeaderProps interface is done in Step 1.

### Step 3: Verify lint + build

```bash
npm run lint && npm run build
```

### Step 4: Commit

```bash
git add components/survey/SurveyHeader.tsx components/survey/SurveyEngine.tsx
git commit -m "feat(survey): redesign SurveyHeader to match Figma

Replace chapter badge with purple pill showing percentage + clock + time.
Simplify progress bar to thin track below header row."
```

---

## Task 3: Redesign SurveyNav

**Files:**

- Modify: `components/survey/SurveyNav.tsx`

**Figma reference:** All 12 screens show:

- Left: "Previous" button — ghost style with border-white/15, ChevronLeft icon
- Center: Status text (e.g. "Question 4 of 90") in white/30
- Right: "Next" button — orange gradient (same as current), ChevronRight icon
- When no answer: Next still shows but opacity reduced
- Disabled Previous at start: opacity-30

### Step 1: Update SurveyNav

The current SurveyNav is very close to Figma already. Minor tweaks:

```tsx
"use client";

import type { FC } from "react";

interface SurveyNavProps {
  canGoBack: boolean;
  canGoNext: boolean;
  hasAnswer: boolean;
  statusText: string;
  onPrevious: () => void;
  onNext: () => void;
}

const ChevronLeft: FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg
    aria-hidden
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m15 18-6-6 6-6" />
  </svg>
);

const ChevronRight: FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg
    aria-hidden
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const SurveyNav: FC<SurveyNavProps> = ({
  canGoBack,
  canGoNext,
  hasAnswer,
  statusText,
  onPrevious,
  onNext,
}) => {
  return (
    <nav className="flex items-center justify-between gap-3">
      {/* Previous */}
      <button
        type="button"
        onClick={onPrevious}
        disabled={!canGoBack}
        className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 font-sans text-[14px] font-medium text-white/70 transition hover:bg-white/10 disabled:pointer-events-none disabled:opacity-30"
      >
        <ChevronLeft className="h-4 w-4" />
        Previous
      </button>

      {/* Center status */}
      <span className="hidden font-sans text-[13px] font-medium text-white/30 sm:block">
        {statusText}
      </span>

      {/* Next */}
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        className={`flex items-center gap-1.5 rounded-full px-6 py-2.5 font-sans text-[14px] font-bold text-white transition ${
          hasAnswer
            ? "bg-gradient-to-r from-[#fe6839] to-[#ff8f6b] shadow-[0_4px_16px_rgba(254,104,57,0.25)] hover:shadow-[0_6px_20px_rgba(254,104,57,0.35)]"
            : "bg-gradient-to-r from-[#fe6839]/60 to-[#ff8f6b]/60 opacity-60"
        } disabled:pointer-events-none disabled:opacity-40`}
      >
        Next
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
};

export default SurveyNav;
```

Changes from current:

- Previous button: `border-white/15 bg-white/5` (was `border-white/20 bg-white/10`), `text-white/70` (was `text-white/80`)
- Center text: `text-[13px] font-medium` (was `text-[14px] font-semibold`)
- Next button padding: `px-6` (was `px-5`)
- Inactive Next: `opacity-60` with `/60` variants (was `opacity-70` with `/70`)

### Step 2: Update statusText in SurveyEngine

In `SurveyEngine.tsx`, update the statusText to show "Question X of Y":

```tsx
// Old:
const statusText = hasAnswer
  ? question.answerType === "multiple"
    ? `${(currentAnswer as string[]).length} selected`
    : "Answer saved"
  : question.required
    ? "Select an option"
    : "Optional — skip or answer";

// New:
const statusText = `Question ${currentIndex + 1} of ${totalQuestions}`;
```

### Step 3: Verify lint + build

```bash
npm run lint && npm run build
```

### Step 4: Commit

```bash
git add components/survey/SurveyNav.tsx components/survey/SurveyEngine.tsx
git commit -m "feat(survey): redesign SurveyNav to match Figma

Adjust Previous button to lighter ghost style, update center status to
show question count, refine Next button inactive state."
```

---

## Task 4: Redesign OpenResponseQuestion

**Files:**

- Modify: `components/survey/questions/OpenResponseQuestion.tsx`

**Figma reference:**

- `4077:280` (empty): Question title in Lora Medium ~39px white, subtitle in purple below ("Please enter your email address"), input with bottom border in peach/orange tint (`#fe6839` at ~20% opacity), placeholder text in white/30, character counter "0 / 500" right-aligned below input
- `4077:142` (error): Red bottom border (`#ef4444`), AlertCircle icon + error message in red below input, character counter shows "5 / 500"
- `4077:214` (valid): Typed text in white, bottom border stays peach tint, "15 / 500" counter, Next button fully active

### Step 1: Rewrite OpenResponseQuestion

```tsx
"use client";

import { useState, type FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";

interface OpenResponseQuestionProps {
  question: SurveyQuestion;
  value: string | null;
  onChange: (value: string) => void;
}

const AlertCircleIcon: FC = () => (
  <svg
    aria-hidden
    className="h-4 w-4 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

const MAX_LENGTH = 500;

function getValidationError(value: string, inputType?: string): string | null {
  if (!value) return null;
  if (inputType === "email") {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) return "Please enter a valid email address";
  }
  if (value.length > MAX_LENGTH) return `Maximum ${MAX_LENGTH} characters allowed`;
  return null;
}

const OpenResponseQuestion: FC<OpenResponseQuestionProps> = ({ question, value, onChange }) => {
  const [touched, setTouched] = useState(false);
  const currentValue = value ?? "";
  const error = touched ? getValidationError(currentValue, question.inputType) : null;

  // Subtitle text from formatGuidance or fallback
  const subtitle =
    question.formatGuidance ||
    (question.inputType === "email" ? "Please enter your email address" : null);

  return (
    <div className="flex flex-col gap-5">
      {/* Question title */}
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-[32px] font-medium leading-[1.2] text-white sm:text-[39px]">
          {question.question}
        </h2>
        {subtitle && <p className="font-sans text-[15px] font-medium text-[#a78bfa]">{subtitle}</p>}
      </div>

      {/* Input */}
      <div className="flex flex-col gap-2">
        <input
          type={question.inputType === "email" ? "email" : "text"}
          value={currentValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={question.placeholder || "Type your answer..."}
          autoComplete={question.inputType === "email" ? "email" : "off"}
          maxLength={MAX_LENGTH}
          className={`w-full border-b-2 bg-transparent pb-3 pt-2 font-sans text-[22px] text-white placeholder:text-white/30 focus:outline-none sm:text-[24px] ${
            error
              ? "border-[#ef4444]"
              : "border-[rgba(254,104,57,0.2)] focus:border-[rgba(254,104,57,0.4)]"
          }`}
        />

        {/* Below input: error message left, char count right */}
        <div className="flex items-start justify-between gap-4">
          {/* Error message */}
          <div className="flex items-center gap-1.5">
            {error && (
              <>
                <span className="text-[#ef4444]">
                  <AlertCircleIcon />
                </span>
                <span className="font-sans text-[13px] font-medium text-[#ef4444]">{error}</span>
              </>
            )}
          </div>

          {/* Character counter */}
          <span className="font-sans text-[12px] font-medium text-white/30">
            {currentValue.length} / {MAX_LENGTH}
          </span>
        </div>
      </div>
    </div>
  );
};

export default OpenResponseQuestion;
```

Key changes from current:

- Title: `font-serif text-[32px] font-medium sm:text-[39px]` (was `font-serif text-[28px] font-bold sm:text-[36px]`)
- Added purple subtitle below title (from `formatGuidance` field)
- Input: `text-[22px] sm:text-[24px]` (was `text-[20px] sm:text-[24px]`)
- Bottom border: peach/orange tint `border-[rgba(254,104,57,0.2)]` (was `border-white/20`)
- Error state: red border + AlertCircle icon + error text
- Character counter: `X / 500` right-aligned below input
- Email validation on blur
- Removed "Skip for now" button (not in Figma)

### Step 2: Verify lint + build

```bash
npm run lint && npm run build
```

### Step 3: Commit

```bash
git add components/survey/questions/OpenResponseQuestion.tsx
git commit -m "feat(survey): redesign OpenResponseQuestion to match Figma

Add peach-tint bottom border, character counter, email validation with
AlertCircle error state, purple subtitle, larger serif title."
```

---

## Task 5: Redesign ScaleQuestion

**Files:**

- Modify: `components/survey/questions/ScaleQuestion.tsx`

**Figma reference:**

- `4077:464` (empty): Title in Lora Medium ~39px, purple subtitle (e.g., "Rate from 1 (very dissatisfied) to 7 (very satisfied)"), "Awaiting selection" text centered in white/40, 7 circle dots connected by thin track line, empty dots have border-white/10 + dark fill, scale labels "Very dissatisfied" / "Very satisfied" below endpoints
- `4077:679` (selected=7): Selected label "Very highly comfortable" centered, "LEVEL 7 OF 7" purple badge below label, all 7 dots filled purple, selected dot is largest with white center dot + glow, track line fills purple up to selected, endpoint labels below
- `4077:548` (with insight): Same as selected + insight panel expanded below

### Step 1: Rewrite ScaleQuestion

```tsx
"use client";

import { type FC, useCallback } from "react";
import type { SurveyQuestion } from "@/data/survey-data";

interface ScaleQuestionProps {
  question: SurveyQuestion;
  value: number | null;
  onChange: (value: number) => void;
}

function getValueLabel(value: number, question: SurveyQuestion): string {
  // Use hoverStates from data if available
  if (question.hoverStates && question.hoverStates[value]) {
    return question.hoverStates[value];
  }
  // Fallback to generic labels
  const FALLBACK: Record<number, string> = {
    1: "Strongly Disagree",
    2: "Disagree",
    3: "Somewhat Disagree",
    4: "Neutral / Mixed",
    5: "Somewhat Agree",
    6: "Agree",
    7: "Strongly Agree",
  };
  return FALLBACK[value] || "";
}

const ScaleQuestion: FC<ScaleQuestionProps> = ({ question, value, onChange }) => {
  const handleDotClick = useCallback(
    (v: number) => {
      onChange(v);
    },
    [onChange]
  );

  const selectedLabel = value ? getValueLabel(value, question) : null;

  // Subtitle from formatGuidance or construct from scale labels
  const subtitle =
    question.formatGuidance ||
    (question.scaleLabels
      ? `Rate from 1 (${question.scaleLabels.low.toLowerCase()}) to 7 (${question.scaleLabels.high.toLowerCase()})`
      : "Rate on a scale of 1 to 7");

  return (
    <div className="flex flex-col gap-6">
      {/* Title + subtitle */}
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-[32px] font-medium leading-[1.2] text-white sm:text-[39px]">
          {question.question}
        </h2>
        <p className="font-sans text-[15px] font-medium text-[#a78bfa]">{subtitle}</p>
      </div>

      {/* Selected value display OR awaiting selection */}
      <div className="flex flex-col items-center gap-2 py-2">
        {selectedLabel ? (
          <>
            <span className="font-sans text-[18px] font-medium text-white/70 sm:text-[20px]">
              {selectedLabel}
            </span>
            <span className="rounded-full border border-[rgba(167,139,250,0.25)] bg-[rgba(167,139,250,0.1)] px-3 py-1 font-sans text-[11px] font-semibold uppercase tracking-wider text-[#a78bfa]">
              Level {value} of 7
            </span>
          </>
        ) : (
          <span className="font-sans text-[16px] font-medium text-white/30">
            Awaiting selection
          </span>
        )}
      </div>

      {/* Dot scale */}
      <div className="flex flex-col gap-3 py-2">
        <div className="relative flex items-center justify-between px-1">
          {/* Track line behind dots */}
          <div className="absolute left-[24px] right-[24px] top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-white/8 sm:left-[28px] sm:right-[28px]">
            {value && (
              <div
                className="h-full rounded-full bg-[#a78bfa] transition-all duration-300 ease-out"
                style={{ width: `${((value - 1) / 6) * 100}%` }}
              />
            )}
          </div>

          {/* Dots */}
          {[1, 2, 3, 4, 5, 6, 7].map((v) => {
            const isSelected = v === value;
            const isBefore = value !== null && v < value;

            return (
              <button
                key={v}
                type="button"
                aria-label={`${v} of 7`}
                onClick={() => handleDotClick(v)}
                className="relative z-10 flex h-[48px] w-[48px] shrink-0 items-center justify-center sm:h-[56px] sm:w-[56px]"
              >
                <span
                  className={`flex items-center justify-center rounded-full transition-all duration-200 ${
                    isSelected
                      ? "h-[48px] w-[48px] border-2 border-[rgba(167,139,250,0.6)] bg-[rgba(167,139,250,0.12)] shadow-[0_0_20px_rgba(167,139,250,0.3)] sm:h-[52px] sm:w-[52px]"
                      : isBefore
                        ? "h-[40px] w-[40px] border-2 border-[rgba(167,139,250,0.4)] bg-[rgba(167,139,250,0.08)]"
                        : "h-[40px] w-[40px] border-2 border-white/10 bg-[#0a0510] hover:border-white/20"
                  }`}
                >
                  <span
                    className={`rounded-full transition-all duration-200 ${
                      isSelected
                        ? "h-3 w-3 bg-white shadow-[0_0_8px_rgba(255,255,255,0.5)]"
                        : isBefore
                          ? "h-2.5 w-2.5 bg-[#a78bfa]"
                          : "h-2 w-2 bg-white/20"
                    }`}
                  />
                </span>
              </button>
            );
          })}
        </div>

        {/* Scale labels */}
        <div className="flex justify-between px-1">
          <span className="max-w-[120px] font-sans text-[11px] font-medium uppercase tracking-wider text-white/35 sm:text-[12px]">
            {question.scaleLabels?.low || "Strongly Disagree"}
          </span>
          <span className="max-w-[120px] text-right font-sans text-[11px] font-medium uppercase tracking-wider text-white/35 sm:text-[12px]">
            {question.scaleLabels?.high || "Strongly Agree"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ScaleQuestion;
```

Key changes from current:

- Title: `font-serif text-[32px] font-medium sm:text-[39px]` (was `text-[28px] font-bold sm:text-[36px]`)
- Added purple subtitle below title
- "Awaiting selection" text when no value selected (was: nothing shown)
- Uses `hoverStates` from data for per-value labels (was: hardcoded AGREE_LABELS/INTENSITY_LABELS)
- Track line: `h-[3px] bg-white/8` (was `h-[4px] bg-white/10`)
- Selected dot: `h-[48px]/[52px]` with purple bg + glow (refined from current)
- Before dots: subtle purple tint bg (was: just border)
- Scale labels: `text-white/35` (was `text-white/40`)

### Step 2: Verify lint + build

```bash
npm run lint && npm run build
```

### Step 3: Commit

```bash
git add components/survey/questions/ScaleQuestion.tsx
git commit -m "feat(survey): redesign ScaleQuestion to match Figma

Add 'Awaiting selection' empty state, purple subtitle, use hoverStates
data for per-value labels, refine dot sizes and track styling."
```

---

## Task 6: Redesign ChoiceCard

**Files:**

- Modify: `components/survey/questions/ChoiceCard.tsx`

**Figma reference:**

- `4078:137` (single empty): Card with rounded corners (14px), border-white/10, bg-white/5, text left-aligned, radio circle on RIGHT side (empty circle, border-white/20)
- `4078:395` (single selected): Orange border + orange tinted bg, text white, radio circle filled orange with white checkmark icon inside
- `4086:169` (multi empty): Same as single but with rounded-square checkbox on right instead of circle
- `4086:274` (multi selected): Orange bg/border, rounded-square checkbox with checkmark

### Step 1: Rewrite ChoiceCard

```tsx
"use client";

import type { FC } from "react";

interface ChoiceCardProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  multi?: boolean;
}

const CheckIcon: FC = () => (
  <svg
    aria-hidden
    className="h-3 w-3 text-white"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ChoiceCard: FC<ChoiceCardProps> = ({ label, selected, onClick, multi = false }) => {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onClick}
      className={`relative flex min-h-[60px] w-full items-center justify-between gap-3 rounded-[14px] border px-4 py-3.5 text-left font-sans text-[15px] font-medium leading-snug transition-all duration-200 sm:text-[16px] ${
        selected
          ? "border-[#fe6839] bg-[rgba(254,104,57,0.12)] text-white shadow-[0_0_16px_rgba(254,104,57,0.1)]"
          : "border-white/10 bg-white/[0.04] text-white/75 hover:border-white/20 hover:bg-white/[0.07]"
      }`}
    >
      {/* Label text */}
      <span className="flex-1">{label}</span>

      {/* Radio circle or Checkbox square — on the right */}
      <span
        className={`flex shrink-0 items-center justify-center transition-all duration-200 ${
          multi
            ? `h-5 w-5 rounded-[5px] ${
                selected
                  ? "bg-[#fe6839] shadow-[0_0_8px_rgba(254,104,57,0.3)]"
                  : "border-2 border-white/20 bg-transparent"
              }`
            : `h-5 w-5 rounded-full ${
                selected
                  ? "bg-[#fe6839] shadow-[0_0_8px_rgba(254,104,57,0.3)]"
                  : "border-2 border-white/20 bg-transparent"
              }`
        }`}
      >
        {selected && <CheckIcon />}
      </span>
    </button>
  );
};

export default ChoiceCard;
```

Key changes from current:

- Added `justify-between` to push indicator to the right
- Added radio circle / checkbox square on the RIGHT side of the card
- Single = circle (`rounded-full`), Multi = rounded square (`rounded-[5px]`)
- Selected indicator: solid orange fill with white checkmark icon
- Unselected indicator: border-white/20 empty circle/square
- Selected card: `bg-[rgba(254,104,57,0.12)]` (was `0.15`), added text-white
- Unselected card: `bg-white/[0.04]` (was `bg-white/5`), `text-white/75` (was `text-white/80`)
- Reduced min-height to `60px` (was `68px`)

### Step 2: Verify lint + build

```bash
npm run lint && npm run build
```

### Step 3: Commit

```bash
git add components/survey/questions/ChoiceCard.tsx
git commit -m "feat(survey): redesign ChoiceCard to match Figma

Add radio/checkbox indicator on right side with orange fill + checkmark
when selected. Adjust card spacing and background opacity."
```

---

## Task 7: Update SingleChoiceQuestion and MultipleChoiceQuestion

**Files:**

- Modify: `components/survey/questions/SingleChoiceQuestion.tsx`
- Modify: `components/survey/questions/MultipleChoiceQuestion.tsx`

**Figma reference:**

- `4078:137` (single): Title in Lora Medium ~39px, purple subtitle (the format guidance), options in single column (not 2-col grid), ~12px gap between cards
- `4086:169` (multi): Same title style, "Select all that apply" subtitle in purple, options single column, ~12px gap

### Step 1: Update SingleChoiceQuestion

```tsx
"use client";

import type { FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import ChoiceCard from "./ChoiceCard";

interface SingleChoiceQuestionProps {
  question: SurveyQuestion;
  value: string | null;
  onChange: (value: string) => void;
  otherText?: string;
  onOtherTextChange?: (text: string) => void;
}

const SingleChoiceQuestion: FC<SingleChoiceQuestionProps> = ({
  question,
  value,
  onChange,
  otherText,
  onOtherTextChange,
}) => {
  // Subtitle from formatGuidance or default
  const subtitle = question.formatGuidance || "Select one option";

  return (
    <div className="flex flex-col gap-5">
      {/* Title + subtitle */}
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-[32px] font-medium leading-[1.2] text-white sm:text-[39px]">
          {question.question}
        </h2>
        <p className="font-sans text-[15px] font-medium text-[#a78bfa]">{subtitle}</p>
      </div>

      {/* Options — single column */}
      <div className="flex flex-col gap-3">
        {question.options.map((option) => (
          <ChoiceCard
            key={option}
            label={option}
            selected={value === option}
            onClick={() => onChange(option)}
          />
        ))}
      </div>

      {/* Other text input */}
      {value && /^other\b/i.test(value) && (
        <input
          type="text"
          value={otherText ?? ""}
          onChange={(e) => onOtherTextChange?.(e.target.value)}
          placeholder="Please specify..."
          className="w-full border-b-2 border-[rgba(254,104,57,0.2)] bg-transparent pb-3 pt-2 font-sans text-[18px] text-white placeholder:text-white/30 focus:border-[rgba(254,104,57,0.4)] focus:outline-none"
          autoFocus
        />
      )}
    </div>
  );
};

export default SingleChoiceQuestion;
```

Key changes:

- Title: `font-serif text-[32px] font-medium sm:text-[39px]` (was `font-sans text-[28px] font-bold sm:text-[36px]`)
- Added purple subtitle from `formatGuidance`
- Layout: single column `flex flex-col gap-3` (was `grid grid-cols-1 gap-2 min-[400px]:grid-cols-2`)
- Other input: bottom-border style matching OpenResponse (was rounded card style)

### Step 2: Update MultipleChoiceQuestion

```tsx
"use client";

import type { FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";
import ChoiceCard from "./ChoiceCard";

interface MultipleChoiceQuestionProps {
  question: SurveyQuestion;
  value: string[] | null;
  onChange: (value: string[]) => void;
  otherText?: string;
  onOtherTextChange?: (text: string) => void;
}

const MultipleChoiceQuestion: FC<MultipleChoiceQuestionProps> = ({
  question,
  value,
  onChange,
  otherText,
  onOtherTextChange,
}) => {
  const selected = value ?? [];

  const toggle = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter((v) => v !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  // Subtitle from formatGuidance or default
  const subtitle = question.formatGuidance || "Select all that apply";

  return (
    <div className="flex flex-col gap-5">
      {/* Title + subtitle */}
      <div className="flex flex-col gap-2">
        <h2 className="font-serif text-[32px] font-medium leading-[1.2] text-white sm:text-[39px]">
          {question.question}
        </h2>
        <p className="font-sans text-[15px] font-medium text-[#a78bfa]">
          {subtitle}
          {selected.length > 0 && (
            <span className="ml-2 text-white/40">({selected.length} selected)</span>
          )}
        </p>
      </div>

      {/* Options — single column */}
      <div className="flex flex-col gap-3">
        {question.options.map((option) => (
          <ChoiceCard
            key={option}
            label={option}
            selected={selected.includes(option)}
            onClick={() => toggle(option)}
            multi
          />
        ))}
      </div>

      {/* Other text input */}
      {selected.some((s) => /^other\b/i.test(s)) && (
        <input
          type="text"
          value={otherText ?? ""}
          onChange={(e) => onOtherTextChange?.(e.target.value)}
          placeholder="Please specify..."
          className="w-full border-b-2 border-[rgba(254,104,57,0.2)] bg-transparent pb-3 pt-2 font-sans text-[18px] text-white placeholder:text-white/30 focus:border-[rgba(254,104,57,0.4)] focus:outline-none"
          autoFocus
        />
      )}
    </div>
  );
};

export default MultipleChoiceQuestion;
```

Key changes:

- Same title + subtitle pattern as SingleChoice
- Single column layout (was 2-col grid)
- Selected count moved into subtitle line
- Other input matches OpenResponse bottom-border style

### Step 3: Verify lint + build

```bash
npm run lint && npm run build
```

### Step 4: Commit

```bash
git add components/survey/questions/SingleChoiceQuestion.tsx components/survey/questions/MultipleChoiceQuestion.tsx
git commit -m "feat(survey): redesign Single/MultipleChoice to match Figma

Switch to serif title, add purple subtitle, single-column layout for
options, bottom-border style for 'other' input."
```

---

## Task 8: Redesign GuidancePanel (Insight Panel)

**Files:**

- Modify: `components/survey/GuidancePanel.tsx`

**Figma reference:**

- `4077:548` (scale with insight): Below the question, always-visible section with book icon + "Support and guidance" serif heading + guidance text. Below that, a "Learn more" button. When expanded, shows insight panel with:
  - "Answer option(s) explained" section: cards showing option label + explanation
  - "How this answer will be used" section at bottom
- `4078:240` (single choice insight): Same pattern, insight shows all 5 options explained as cards
- `4086:382` (multi choice insight): Same pattern, 6 option cards

### Step 1: Rewrite GuidancePanel

```tsx
"use client";

import { useState, type FC } from "react";
import type { SurveyQuestion } from "@/data/survey-data";

interface GuidancePanelProps {
  question: SurveyQuestion;
}

const BookIcon: FC = () => (
  <svg
    aria-hidden
    className="h-5 w-5 shrink-0 text-[#a78bfa]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const ChevronIcon: FC<{ open: boolean }> = ({ open }) => (
  <svg
    aria-hidden
    className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const LightbulbIcon: FC = () => (
  <svg
    aria-hidden
    className="h-4 w-4 shrink-0 text-[#fe6839]"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
    <path d="M9 18h6" />
    <path d="M10 22h4" />
  </svg>
);

const GuidancePanel: FC<GuidancePanelProps> = ({ question }) => {
  const [insightOpen, setInsightOpen] = useState(false);

  const supportText = question.supportAndGuidance || question.guide;
  const hasInsight =
    (question.answerOptionsExplained && question.answerOptionsExplained.length > 0) ||
    question.howAnswerIsUsed ||
    question.comment;
  const hasContent = supportText || hasInsight;

  if (!hasContent) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Always-visible: Support and guidance */}
      {supportText && (
        <div className="flex gap-3 rounded-[16px] border border-white/8 bg-white/[0.03] p-5">
          <BookIcon />
          <div className="flex flex-col gap-2">
            <h4 className="font-serif text-[16px] font-semibold text-white/80">
              Support and guidance
            </h4>
            <p className="font-sans text-[14px] leading-relaxed text-white/50">{supportText}</p>
          </div>
        </div>
      )}

      {/* Learn more toggle — only if there's insight content */}
      {hasInsight && (
        <>
          <button
            type="button"
            onClick={() => setInsightOpen((o) => !o)}
            className="flex items-center gap-2 self-start rounded-full border border-[rgba(254,104,57,0.2)] bg-[rgba(254,104,57,0.08)] px-4 py-2 font-sans text-[13px] font-medium text-[#fe6839] transition hover:bg-[rgba(254,104,57,0.12)]"
          >
            <LightbulbIcon />
            <span>{insightOpen ? "Hide details" : "Learn more"}</span>
            <ChevronIcon open={insightOpen} />
          </button>

          {/* Collapsible insight panel */}
          <div
            className="overflow-hidden transition-all duration-300 ease-out"
            style={{
              maxHeight: insightOpen ? "2000px" : "0px",
              opacity: insightOpen ? 1 : 0,
            }}
          >
            <div className="flex flex-col gap-5 rounded-[16px] border border-white/8 bg-white/[0.03] p-5">
              {/* Answer options explained */}
              {question.answerOptionsExplained && question.answerOptionsExplained.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h4 className="font-sans text-[12px] font-semibold uppercase tracking-wider text-white/40">
                    Answer option(s) explained
                  </h4>
                  <div className="flex flex-col gap-2.5">
                    {question.answerOptionsExplained.map((item, i) => (
                      <div
                        key={i}
                        className="rounded-[12px] border border-white/6 bg-white/[0.03] p-4"
                      >
                        <h5 className="mb-1 font-sans text-[14px] font-semibold text-white/70">
                          {item.option}
                        </h5>
                        <p className="font-sans text-[13px] leading-relaxed text-white/45">
                          {item.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* How this answer will be used */}
              {(question.howAnswerIsUsed || question.comment) && (
                <div className="flex flex-col gap-2 border-t border-white/6 pt-4">
                  <h4 className="font-sans text-[12px] font-semibold uppercase tracking-wider text-white/40">
                    How this answer will be used
                  </h4>
                  <p className="font-sans text-[14px] leading-relaxed text-white/50">
                    {question.howAnswerIsUsed || question.comment}
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GuidancePanel;
```

Key changes from current:

- "Support and guidance" section is ALWAYS VISIBLE (was: everything behind toggle)
- Uses serif heading "Support and guidance" with book icon (was: "User Guidance" sans)
- New "Learn more" button with lightbulb icon in orange theme (was: purple "Learn more about this question")
- Expandable insight panel shows:
  - "Answer option(s) explained" — cards from `answerOptionsExplained` data
  - "How this answer will be used" — from `howAnswerIsUsed` data
- Removed `chapterIntro` prop (background info removed from panel in Figma)
- Card styling: `border-white/6 bg-white/[0.03]` (subtle nested cards)

### Step 2: Update SurveyEngine — remove chapterIntro from GuidancePanel

In `components/survey/SurveyEngine.tsx`:

```tsx
// Old:
<GuidancePanel question={question} chapterIntro={currentChapterIntro} />

// New:
<GuidancePanel question={question} />
```

### Step 3: Verify lint + build

```bash
npm run lint && npm run build
```

### Step 4: Commit

```bash
git add components/survey/GuidancePanel.tsx components/survey/SurveyEngine.tsx
git commit -m "feat(survey): redesign GuidancePanel to match Figma

Always-visible 'Support and guidance' section with serif title,
expandable insight panel with option explanation cards and usage info.
Remove chapterIntro dependency."
```

---

## Task 9: Update SurveyEngine Layout

**Files:**

- Modify: `components/survey/SurveyEngine.tsx`

**Figma reference:** All screens show:

- Max-width container ~600px (was 512px)
- Background gradient blurs (keep as-is)
- Question area takes full space between header and nav
- Guidance panel directly below question content
- Nav fixed at bottom of viewport

### Step 1: Update SurveyEngine container and layout

Key changes to `SurveyEngine.tsx`:

- Container max-width: `max-w-[600px]` (was `max-w-[512px]`)
- Remove `GuideAvatar` component usage (chapter intros handled differently in new design)
- Keep the chapter intro dismissal logic but simplify — the GuideAvatar is no longer needed for the Figma design
- Nav should be positioned at the bottom of the viewport area

```tsx
// In the return statement, update the container:
<div className="relative z-10 mx-auto flex w-full max-w-[600px] flex-1 flex-col gap-6 px-6 pb-32 pt-6 sm:px-8 sm:pt-10">
```

Also remove the `GuideAvatar` import and usage if not in Figma design:

```tsx
// Remove:
import GuideAvatar from "./GuideAvatar";
// Remove the GuideAvatar component at the bottom
```

### Step 2: Verify lint + build

```bash
npm run lint && npm run build
```

### Step 3: Commit

```bash
git add components/survey/SurveyEngine.tsx
git commit -m "feat(survey): update SurveyEngine layout for redesign

Widen container to 600px, adjust padding, remove GuideAvatar."
```

---

## Task 10: Final Integration Testing

### Step 1: Run lint

```bash
npm run lint
```

Expected: No errors.

### Step 2: Run build

```bash
npm run build
```

Expected: Build succeeds.

### Step 3: Run unit tests

```bash
npm test
```

Expected: All tests pass (some may need updating if they reference old component props).

### Step 4: Manual testing in browser

```bash
npm run dev
```

Test each question type:

1. Navigate to `/survey` → go through intro → reach survey engine
2. **Open response (email)**: Verify placeholder, peach bottom border, character counter, error state on invalid email
3. **Open response (text)**: Verify placeholder, character counter
4. **Scale question**: Verify "Awaiting selection" text, click dots, verify label + "LEVEL X OF 7" badge, purple track fill
5. **Single choice**: Verify radio circle on right, orange selected state with checkmark
6. **Multiple choice**: Verify checkbox square on right, multiple selection, count in subtitle
7. **Support and guidance**: Verify always visible with book icon + serif title
8. **Learn more / insight panel**: Click "Learn more", verify option explanation cards appear
9. **Header**: Verify PROGRESS label, purple pill with %, clock icon, time estimate
10. **Nav**: Verify Previous/Next buttons, center status "Question X of Y"

### Step 5: Fix any issues found during testing

Address each issue as it's found. Common things to watch for:

- TypeScript errors from changed interfaces
- Missing data fields (new CSV columns not populated)
- Styling discrepancies vs Figma

### Step 6: Final commit

```bash
git add -A
git commit -m "fix(survey): address integration issues from redesign testing"
```

---

## Execution Notes

- **Desktop only**: All styles target desktop/laptop. Mobile breakpoints will be a separate task.
- **Data backward compat**: `guide` and `comment` fields kept alongside new `supportAndGuidance` and `howAnswerIsUsed` so existing code doesn't break during transition.
- **Scoring engine**: No changes needed — scoring reads `qId` and answer values, not UI fields.
- **Survey tracking**: No changes needed — hooks track by question index and answer state.
- **Existing tests**: Unit tests in `__tests__/` may need updates for changed props (e.g., `chapter` removed from SurveyHeader).
