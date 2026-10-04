# AGENTS.md

Instructions for AI coding agents working in this repository. The full project instructions are in
[`CLAUDE.md`](CLAUDE.md); read it first.

## Pull requests into `main`

`main` deploys to production. When the work on a PR into `main` is done, request a review from Eman
(`@eman-cickusic`):

```bash
gh pr edit <number> --add-reviewer eman-cickusic
```

This holds for every PR, whoever or whatever wrote it. `.github/CODEOWNERS` usually requests him
when the PR opens; add him anyway, which does nothing if he is already requested. A PR opened from
Eman's own account cannot request its author.
