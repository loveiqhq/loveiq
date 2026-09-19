import type { ReactNode } from "react";

/**
 * Renders an educational-body paragraph with its leading label emphasised, the way
 * Figma sets these blocks. Verified on node 8880:423, where the paragraph is one
 * `<p>` split into two spans:
 *   "Secure"  → Manrope Bold, #161021
 *   ": closeness and autonomy both feel safe; …" → Manrope Regular, #3f3a4d
 *
 * The five attachment patterns, the reward chemicals and similar lists all use
 * that "Label: explanation" shape, so the bold half is derived from the copy
 * rather than duplicated into the data: everything before the FIRST colon becomes
 * the label, provided it looks like a label rather than prose.
 *
 * Guards, so ordinary sentences containing a colon are left alone:
 *   - the label must be short (≤ 34 chars)
 *   - it must not contain sentence-ending punctuation
 *   - there must be text after the colon
 * Paragraphs that don't match render unchanged.
 */
export function renderEduPara(text: string): ReactNode {
  const i = text.indexOf(":");
  if (i <= 0 || i > 34) return text;

  const label = text.slice(0, i);
  const rest = text.slice(i);
  if (/[.!?]/.test(label)) return text;
  if (!rest.slice(1).trim()) return text;

  return (
    <>
      <span className="report-learn-para-label">{label}</span>
      {rest}
    </>
  );
}
