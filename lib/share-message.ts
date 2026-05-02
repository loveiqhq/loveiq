export const SHARE_MESSAGE_BODY = `Hey,

I recently did this pretty fascinating test on loveiq.org. It analyzes your sexuality and relationship patterns in a very thoughtful, science-based way.

It actually gave me a surprisingly deep perspective on how I experience desire, connection, and intimacy. Way beyond the usual "personality test" stuff.

Thought of you while doing it, as I think you\u2019d find it genuinely interesting (and maybe even a bit eye-opening). No pressure at all of course.

If you try it, I\u2019d love to hear what you think \u{1F90D}`;

export function appendUrlToMessage(message: string, url: string): string {
  const trimmed = message.trim();
  if (!trimmed) return url;
  if (trimmed.includes(url)) return trimmed;
  return `${trimmed}\n\n${url}`;
}

export function buildShareMessage(url: string): string {
  return appendUrlToMessage(SHARE_MESSAGE_BODY, url);
}
