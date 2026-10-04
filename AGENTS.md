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

## Working alongside other sessions

Several people and AI sessions work on this repository at the same time, often on one machine.
Follow the "Working alongside other sessions" section of `CLAUDE.md` in full. In short:

- Work in your own worktree on your own branch, created from `origin/main`. Never switch
  branches, reset, stash or rebase in a checkout you did not create.
- Never force-push to `main`, `staging` or anyone else's branch, and never rewrite history
  another session uses. Re-read `git log -1` right before any history operation.
- Discard (`git checkout --`, `git restore`, `git stash`, `git clean`) only your own changes.
- Delete only the worktrees and branches you created, and only after they are merged. Delete a
  remote branch with `gh api -X DELETE repos/loveiqhq/loveiq/git/refs/heads/<branch>`, not
  `git push --delete`, which runs the pre-push hook in whatever checkout you are in.
- Never run `npm install` in someone else's checkout, never stop a process you did not start,
  and run your own server on a free port.
- Read live settings before changing them, and list every outside change in the PR. Run `--apply`
  scripts only from a clean worktree of `origin/main`, after checking which database or service
  `.env.local` points them at.
- Push your branch whenever you stop.
