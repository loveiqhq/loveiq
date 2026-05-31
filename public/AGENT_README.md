# public/

Static assets served directly at the root URL path, not processed by the Next.js bundler. Includes images, videos, favicons, and app icons.

## Key Conventions

- Assets are organized by page/feature: `about/`, `academic/`, `carousel/`, `images/`, `privacy/`, `payment-logos/`, `testimonials/`.
- Hero videos exist in two variants: `couple-hero.mp4` (desktop) and `couple-hero-mobile.mp4` (mobile).
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
| `.well-known/`   | Domain verification / well-known files                |
