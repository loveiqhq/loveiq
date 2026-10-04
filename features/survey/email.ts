/**
 * The survey's email rule, shared by the email question and /api/survey so the browser
 * refuses exactly what the server refuses.
 *
 * They used to differ. The question accepted anything shaped like a@b.c, the server ran
 * zod's stricter check, and an address that passed the first and failed the second (a
 * dot before the @, two dots in a row, an accented letter, a trailing comma) was refused
 * at the very end, 56 questions later, on every Retry. This is zod 4.6's own pattern,
 * pinned here so a dependency upgrade cannot split the two again.
 */
export const SURVEY_EMAIL_RE =
  /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/**
 * Tidies what pasting and autocorrect add around an address: surrounding whitespace, a
 * leading "mailto:", angle brackets or quotes, and a trailing dot, comma or semicolon. It
 * never repairs the address itself; anything still wrong is refused, and the email
 * question asks the reader to fix it.
 */
export function tidySurveyEmail(value: string): string {
  return value
    .normalize("NFC")
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/^[<"'“‘\s]+|[>"'”’\s]+$/g, "")
    .replace(/[.,;]+$/, "")
    .trim();
}

export function isValidSurveyEmail(value: string): boolean {
  const tidied = tidySurveyEmail(value);
  return tidied.length <= 320 && SURVEY_EMAIL_RE.test(tidied);
}
