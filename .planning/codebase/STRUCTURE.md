# Codebase Structure

**Analysis Date:** 2025-01-14

## Directory Layout

```
loveiq-web/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/               # API route handlers
│   │   ├── contact/       # Contact form endpoint
│   │   └── waitlist/      # Waitlist signup endpoint
│   ├── about/             # About page
│   ├── waitlist/          # Waitlist page
│   ├── globals.css        # Global styles and CSS variables
│   ├── layout.tsx         # Root layout with fonts and scripts
│   ├── page.tsx           # Landing page (home)
│   ├── robots.ts          # robots.txt generation
│   └── sitemap.ts         # sitemap.xml generation
├── components/            # React components organized by page
│   ├── landing/           # Landing page sections
│   ├── about/             # About page sections
│   └── theme.ts           # Shared gradient/styling constants
├── lib/                   # Utilities and helpers
│   ├── analytics.ts       # Google Analytics tracking helpers
│   └── emails/            # Email templates
│       └── waitlist.ts    # Waitlist confirmation email
├── public/                # Static assets (images, icons)
├── .planning/             # GSD planning files
├── node_modules/          # Dependencies (gitignored)
├── .next/                 # Next.js build output (gitignored)
├── package.json           # Project manifest
├── package-lock.json      # Dependency lockfile
├── tsconfig.json          # TypeScript configuration
├── tailwind.config.js     # Tailwind CSS configuration
├── postcss.config.js      # PostCSS configuration
├── next.config.js         # Next.js configuration
├── .eslintrc.json         # ESLint configuration
├── .gitignore             # Git ignore rules
├── CLAUDE.md              # Claude Code instructions
└── SECURITY.md            # Security documentation
```

## Directory Purposes

**app/**

- Purpose: Next.js App Router - pages and API routes
- Contains: Page components (`.tsx`), API handlers (`route.ts`), metadata
- Key files: `layout.tsx` (root layout), `page.tsx` (home), `globals.css`
- Subdirectories: `api/` (endpoints), `about/`, `waitlist/` (pages)

**app/api/**

- Purpose: Server-side API endpoints
- Contains: Route handlers for form submissions
- Key files: `waitlist/route.ts`, `contact/route.ts`
- Pattern: Each endpoint in its own directory with `route.ts`

**components/**

- Purpose: Reusable UI components organized by page context
- Contains: React components (`.tsx`)
- Key files: `theme.ts` (design tokens)
- Subdirectories: `landing/` (12+ sections), `about/` (8 sections)

**components/landing/**

- Purpose: Landing page section components
- Contains: `HeroSection`, `NavSection`, `FooterSection`, `Section05-12`, etc.
- Key files: `LandingPage.tsx` (main composition), `ScrollAnimator.tsx`
- Pattern: One component per section

**components/about/**

- Purpose: About page section components
- Contains: `HeroSection`, `TeamSection`, `ContactSection`, etc.
- Key files: `AboutPage.tsx` (main composition)
- Pattern: One component per section

**lib/**

- Purpose: Shared utilities and non-component code
- Contains: Helper functions, email templates
- Key files: `analytics.ts` (GA4 tracking)
- Subdirectories: `emails/` (email templates)

**public/**

- Purpose: Static assets served at root URL
- Contains: Images, icons, favicons
- Key files: `images/LoveiqLogo.svg`, various marketing images
- Note: Directly accessible at `/images/...`

## Key File Locations

**Entry Points:**

- `app/layout.tsx` - Root layout with fonts, scripts, metadata
- `app/page.tsx` - Landing page entry (renders `LandingPage`)
- `app/about/page.tsx` - About page entry

**Configuration:**

- `tsconfig.json` - TypeScript compiler options
- `next.config.js` - Next.js config with security headers
- `tailwind.config.js` - Tailwind with custom design tokens
- `postcss.config.js` - PostCSS plugins
- `.eslintrc.json` - ESLint rules (extends next/core-web-vitals)
- `.env.local` - Environment variables (gitignored)

**Core Logic:**

- `app/api/waitlist/route.ts` - Waitlist signup handler
- `app/api/contact/route.ts` - Contact form handler
- `lib/analytics.ts` - Analytics event tracking
- `lib/emails/waitlist.ts` - Email template

**Styling:**

- `app/globals.css` - CSS custom properties and utility classes
- `components/theme.ts` - Gradient and effect constants
- `tailwind.config.js` - Design system tokens

**Documentation:**

- `CLAUDE.md` - Claude Code instructions for this repo
- `SECURITY.md` - Environment variable documentation

## Naming Conventions

**Files:**

- `PascalCase.tsx` - React components (e.g., `HeroSection.tsx`)
- `camelCase.ts` - Utility/library files (e.g., `analytics.ts`)
- `kebab-case` - Directories (e.g., `app/api/waitlist/`)
- `route.ts` - Next.js API route handlers

**Directories:**

- Lowercase/kebab-case for all directories
- Page directories match URL path (e.g., `about/` → `/about`)
- Component directories named after page context (`landing/`, `about/`)

**Special Patterns:**

- `page.tsx` - Next.js page component (required for routes)
- `layout.tsx` - Next.js layout component
- `route.ts` - Next.js API route handler
- `Section##.tsx` - Numbered sections (e.g., `Section05.tsx` through `Section12.tsx`)

## Where to Add New Code

**New Page:**

- Create `app/{page-name}/page.tsx`
- Add page component to `components/{page-name}/`
- Create `{PageName}Page.tsx` as main composition

**New Landing Section:**

- Add component to `components/landing/`
- Follow naming: `{SectionName}Section.tsx` or `Section##.tsx`
- Import and add to `LandingPage.tsx`

**New API Endpoint:**

- Create `app/api/{endpoint}/route.ts`
- Export `POST`, `GET`, etc. functions
- Add Zod schema for validation
- Include rate limiting

**New Utility:**

- Add to `lib/` directory
- Use camelCase naming
- Export typed functions

**New Email Template:**

- Add to `lib/emails/`
- Export object with `subject`, `html`, `text`

## Special Directories

**.next/**

- Purpose: Next.js build output and cache
- Source: Generated by `npm run build` / `npm run dev`
- Committed: No (in `.gitignore`)

**.planning/**

- Purpose: GSD project planning files
- Source: Created by GSD commands
- Committed: Yes (documentation)

**node_modules/**

- Purpose: npm dependencies
- Source: Installed by `npm install`
- Committed: No (in `.gitignore`)

**Temporary Files (should be cleaned):**

- `tmp_index.css` - Temporary CSS file (~402KB)
- `tmp_index.js` - Temporary JS file (~8.5MB)
- `tmp_loveiq.html` - Temporary HTML file
- Note: These appear to be development artifacts

---

_Structure analysis: 2025-01-14_
_Update when directory structure changes_
