# The Daily Index — working rules

The design and history of the paper live in `ARCHITECTURE.md`; setup, the
sections and the commands in `README.md`. Read the relevant parts before
changing anything.

## Every release updates the documentation

A release is anything merged to `master` (Vercel deploys `master` to
production). In the same branch and PR as the code, before it merges:

1. **`ARCHITECTURE.md`**: a new "Round N: …" entry (dated) saying what changed,
   where (files, functions, keys) and why; and any "(current)" section the
   change makes wrong is corrected in place, so nothing reads as true that no
   longer is.
2. **`README.md`**: the "What's in the paper" table, setup, environment
   variables and commands, wherever the change shows.
3. **`.env.example`**: any new or renamed setting, with a comment.
4. **Header comments** of every file the change touches: the block at the top
   of each component or module says what it does now.
5. **Store keys and versions**: a bumped cache key or preferences version is
   named in the Round entry, with what happens to copies saved under the old
   one.

The PR description lists which documents were updated. A change that needs no
documentation says so in the PR.

## Release checklist

- `npm run typecheck` and `npm run lint` pass.
- The change is seen working in the app (`npm run dev`), not only compiled.
- Documentation updated as above.
- Branch → PR → merge to `master`; Vercel deploys it. Check the production
  deployment finished (`gh api repos/RishabhRaj7/the-daily-index/deployments`)
  and the page answers.
