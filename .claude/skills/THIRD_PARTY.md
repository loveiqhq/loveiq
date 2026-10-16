# Third-party skills

These skill folders come from outside LoveIQ. Each is a copy of its upstream at the commit
below, read in full before it was added (2026-10-11), with its license file kept beside it.
Every Claude Code session opened in this repo loads them, and the same skills are in the
claude.ai organization library for every member.

| Folder                       | Upstream (path in that repo)                                | Commit / version  | License    |
| ---------------------------- | ----------------------------------------------------------- | ----------------- | ---------- |
| `security-audit`             | `cloudflare/security-audit-skill` (`skills/security-audit`) | `c1c8a8c1`        | MIT        |
| `design-taste-frontend`      | `Leonxlnx/taste-skill` (`skills/taste-skill`)               | `717446e0`        | MIT        |
| `redesign-existing-projects` | `Leonxlnx/taste-skill` (`skills/redesign-skill`)            | `717446e0`        | MIT        |
| `high-end-visual-design`     | `Leonxlnx/taste-skill` (`skills/soft-skill`)                | `717446e0`        | MIT        |
| `minimalist-ui`              | `Leonxlnx/taste-skill` (`skills/minimalist-skill`)          | `717446e0`        | MIT        |
| `industrial-brutalist-ui`    | `Leonxlnx/taste-skill` (`skills/brutalist-skill`)           | `717446e0`        | MIT        |
| `full-output-enforcement`    | `Leonxlnx/taste-skill` (`skills/output-skill`)              | `717446e0`        | MIT        |
| `stitch-design-taste`        | `Leonxlnx/taste-skill` (`skills/stitch-skill`)              | `717446e0`        | MIT        |
| `imagegen-frontend-web`      | `Leonxlnx/taste-skill` (`skills/imagegen-frontend-web`)     | `717446e0`        | MIT        |
| `imagegen-frontend-mobile`   | `Leonxlnx/taste-skill` (`skills/imagegen-frontend-mobile`)  | `717446e0`        | MIT        |
| `brandkit`                   | `Leonxlnx/taste-skill` (`skills/brandkit`)                  | `717446e0`        | MIT        |
| `impeccable`                 | `pbakaus/impeccable` (`.claude/skills/impeccable`)          | `c63b8dd7`, 4.5.2 | Apache-2.0 |
| `img2threejs`                | `img2threejs/img2threejs` (the whole repository)            | `d508b596`, 2.0.0 | Apache-2.0 |
| `awesome-design-md`          | `VoltAgent/awesome-design-md` (`design-md/*/DESIGN.md`)     | `13be5c05`        | MIT        |
| `playwright-cli`             | npm `@playwright/cli` 0.1.22 (`skills/playwright-cli`)      | 0.1.22            | Apache-2.0 |

Full commits: security-audit `c1c8a8c1471069fb0e188eeaff69b8e8db6564a8`, taste-skill
`717446e07a78d4e6d7918b1fde1a263378eebac9`, impeccable `c63b8dd7dd5a5f3c32eaabe1af76d0694f863ed2`,
img2threejs `d508b596cb221f1509f6e50ab68fce275a5cfb44`, awesome-design-md
`13be5c05c63be24b57581162364167028020f043`.

## What differs from upstream

- Folder names follow each skill's `name`, which claude.ai requires (taste-skill's folders are
  named differently upstream).
- Left out: security-audit's own tests (`*.test.cjs`); img2threejs's `.github/`, `bin/` (its npm
  installer), `package.json`, `assets/`, `forge/tests/`, `CONTRIBUTING.md` and `CLAUDE.md`
  (Claude Code would read that last one as instructions for this repo); the per-brand
  `README.md` files of awesome-design-md, which only link to getdesign.md.
- Also left out of img2threejs: `integrations/` (optional pipelines that prefer a stealth
  "anti-bot" Chromium called `cloakbrowser`, upload reference images to a Hugging Face Space with
  the user's stored token, and download unpinned models) and `README.md` (its setup runs
  `npx --yes …@latest` installers and adds a shell alias). The core loop, local Python in
  `forge/`, is complete without them.
- `impeccable/scripts/impeccable` and `impeccable.cmd` carry a marked LoveIQ change: they switch
  impeccable's telemetry, update check and staleness check off unless the caller sets
  `IMPECCABLE_NO_TELEMETRY`, `IMPECCABLE_NO_UPDATE_CHECK` or `IMPECCABLE_NO_STALENESS_CHECK`
  itself. Those three are the engine's own opt-outs; nothing else changes.
- Not taken from taste-skill: `taste-skill-v1` (superseded by `design-taste-frontend`),
  `gpt-tasteskill` (written for GPT and Codex) and `image-to-code-skill` (it must first generate
  images itself, which Claude cannot, and it triggers on any visual web task).
- `awesome-design-md/SKILL.md` is ours: the upstream is a collection of files, not a skill.
- In the organization-library zips only, `impeccable` and `img2threejs` have front matter keys
  claude.ai refuses: `version` moves under `metadata`, `user-invocable` and `argument-hint` are
  dropped, and `metadata.modified` says so. The text after the front matter is unchanged.

Every file is otherwise byte-for-byte upstream, which is why these folders are in
`.prettierignore`.

## What the audit found (2026-10-11), and what to keep in mind

No prompt injection, hidden text, malware or credential requests in any of them. The points
below are how they behave, not defects to fix here.

- **impeccable runs a program, not just instructions.** On first use its launcher downloads an
  unsigned native engine (`engine-v0.1.14` from `pbakaus/impeccable`'s GitHub releases, checked
  only against a checksum from the same release) into `~/.impeccable/bin` and runs it every
  session. The engine tells Claude that skill invocation authorises its subagents and that
  "unattended" system prompts do not apply. Its live mode puts a token in the dev page that any
  script on that page can read, and with it read project files such as `.env.local`: use live
  mode only on a local page with no third-party scripts, and never commit the script tag or CSP
  change it adds. Eman chose to ship it to everyone knowing this.
- **img2threejs** executes commands from installed `img2` plugins (`~/.img2`) without
  signatures. Nothing happens unless someone installs `img2` plugins.
- **playwright-cli** pre-approves its own commands (`allowed-tools`), so in default permission
  mode its browser runs without a prompt. Text on a web page is untrusted input.
- **The taste-skill design skills** suggest realistic placeholder numbers and dates, real
  company logos for "trusted by" walls, `@latest` installs and images from picsum.photos. On a
  LoveIQ page none of that overrides LoveIQ's rules (see `CLAUDE.md`).
- **awesome-design-md** files sometimes end with upstream housekeeping (a `npx @google/design.md lint` step, scripts not included); its `SKILL.md` tells Claude to skip those.

## Updating one

1. Copy the upstream folder again at a newer commit, with the same exclusions, and read the
   diff in full. These files are instructions that every session follows, so never take a new
   upstream copy unread, and never point the repo or the organization at an upstream that
   updates itself.
2. Update the table above.
3. For `playwright-cli`: bump `@playwright/cli` in `package.json`, then run
   `npx playwright-cli install --skills` so the skill matches it. The CLI warns once a day when
   they differ.
4. For the organization library: zip the folder so that `<name>/SKILL.md` is at the top of the
   zip, adjust the front matter as above, and upload it in claude.ai → Organization settings →
   Plugins & skills (see `docs/claude-ai-skills/README.md`). Uploading under an existing name
   saves a new version.
