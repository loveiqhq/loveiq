# features/legal

**Purpose:** Shared legal-page navigation (`LegalNavSection`) used by `/privacy-policy`, `/terms-of-use`, `/terms-and-conditions`, `/cookies`, `/imprint`, `/medical-disclaimer`, `/digital-content-terms`.

**Entry:** `ui/LegalNavSection.tsx`.

**Belongs:** chrome shared across legal pages.

**Does NOT belong:** legal page body content (lives inline in each `app/<page>/page.tsx`). If legal pages grow per-page section components, add them here under `ui/<page-name>/`.
