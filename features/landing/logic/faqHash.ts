/**
 * The key `faq_expanded` carries for a question (`question_text_hash`): a tiny stable hash
 * of its text, no PII. One function for every landing FAQ, so both arms of the landing test
 * key the same question the same way.
 */
export function hashQuestion(q: string): string {
  let h = 5381;
  for (let i = 0; i < q.length; i++) h = (h * 33) ^ q.charCodeAt(i);
  return (h >>> 0).toString(36);
}
