# public/

Static assets served directly at the root URL path, not processed by the Next.js bundler. Includes images, videos, favicons, and app icons.

## Key Conventions

- Assets are organized by page/feature: `about/`, `academic/`, `carousel/`, `images/`, `privacy/`, `payment-logos/`, `testimonials/`.
- The landing hero video (arm `white_video` of the landing A/B) lives in `videos/white/`: `emma-intro.<hash>.mp4`, the full 1280×720 video with sound; its poster is `images/white/emma-poster.<hash>.jpg`. Both are encoded from Marcus's `VEED` export. Its 7.5 s muted loop (`emma-preview`) was deleted on 29.10 with the autoplay: the box now waits on the poster until a tap.
- Video and image names carry the first 8 hex of their sha256: `next.config.js` caches `*.mp4` and images as immutable for a year, so a re-encode must get a new name.
- `videos/` is skipped by the middleware (`proxy.ts` matcher), like `images/`, because a browser fetches a video in many byte-range requests.
- `couple-hero.mp4` and `couple-hero-mobile.mp4` belong to the retired dark landing and are no longer used.
- Favicon/icon assets: `favicon.svg` (browser tab), `apple-touch-icon.png` (iOS home screen), `images/LoveiqLogo.svg` (schema.org logo).

## Subdirectories

| Directory        | Contents                                              |
| ---------------- | ----------------------------------------------------- |
| `about/`         | About page images (team photos, etc.)                 |
| `academic/`      | Academic board member photos                          |
| `carousel/`      | Landing page carousel images                          |
| `images/`        | Shared images (logo, archetype cards, report preview) |
| `privacy/`       | Privacy policy related images                         |
| `payment-logos/` | Payment-provider logos shown at checkout              |
| `testimonials/`  | Testimonial author images                             |
| `videos/`        | Landing hero video                                    |
| `.well-known/`   | Domain verification / well-known files                |
