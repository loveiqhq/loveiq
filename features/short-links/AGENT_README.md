# features/short-links

**Purpose:** short links for the AI influencer pilot run by Seedlane (Nora, Mila, Elena, Jonas;
from 2026-10-30). `loveiq.org/<code>` sends people to the landing page tagged like the pilot's
long links, so a DM or a comment carries seven characters instead of a long tagged address.

**How it works:**

1. Seedlane creates a link: `POST https://www.loveiq.org/api/short-links` with
   `Authorization: Bearer <SHORT_LINK_API_KEY>` and
   `{ "influencer": "mila", "platform": "tiktok", "placement": "dm", "meta": { ... } }`.
   The answer holds `url` (`https://loveiq.org/k3x9p2a`) and `target` (where it goes).
   Use the www host: the apex-to-www redirect drops the `Authorization` header.
2. A person opens the link. `proxy.ts` answers before anything else, counts the click
   (`short_link_click`, people only: link previews, our probes and HEAD requests are followed
   uncounted) and redirects (307) to
   `/?utm_source=<platform>&utm_medium=social&utm_campaign=ai_<influencer>&utm_content=<placement>&utm_term=<code>`
   (`paid_social` for `ad`). The landing request then counts the visit and stores the tags
   like any tagged visit, so a survey or a payment joins back to its link through `utm_term`.
3. Seedlane reads clicks back: `GET https://www.loveiq.org/api/short-links` with the same key,
   filtered by `code`, `influencer`, `since` (YYYY-MM-DD, by creation) and `limit` (1-1000,
   default 200).

**Fields:** `platform` is tiktok, instagram, facebook or linkedin; `placement` is bio, dm,
comment or ad (a promoted post); `influencer` is 2-30 lowercase letters, digits or `_`. `meta` is
Seedlane's own notes: up to 20 flat keys (letters, digits, `_`) with short text, number or
true/false values. It never reaches the address.

**Data:** `public.short_link` (migration `20261030010000_short_link.sql`). `meta` can name a
person, so the team export masks it and the PostHog warehouse role has no access. ROPA
activity 17.

**Files:** `logic/shortLink.ts` (codes, the tagged target, the short address; pure),
`server/shortLinks.ts` (the table), `app/api/short-links/route.ts` (the API), the
`answerShortLink` block in `proxy.ts` (the redirect).

**Does NOT belong:** the pilot's long tracking links (they need no code: the builder page for
Seedlane makes them), reporting on the pilot (AP-Analytics).
