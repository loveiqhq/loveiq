# brain-embed

Deployed Supabase Edge Function, captured into the repo on 2026-09-20. It was
live with **no source in this repository** — like the nine database objects in
`20260307095959_objects_that_predate_the_migration_history.sql`, it could not
have been rebuilt from here.

`index.ts` is the source read back from the deployed function. It is a faithful
copy, but nothing has yet proved it byte-identical to what is running; a
`supabase functions deploy` would settle that, and until then treat the live
function as authoritative if the two ever disagree.

## Deploy settings

`verify_jwt = true` — the function refuses unauthenticated calls, and
`features/brain/server/embed.ts` calls it with the service-role key. Redeploying
without this flag would expose it.

```bash
npx supabase functions deploy brain-embed --project-ref <ref>
```

## Why it exists

Embeddings are computed inside Supabase with `gte-small`, which ships with the
edge runtime: 384 dimensions, no API key, no per-token bill, and no third party
seeing the corpus — which holds revenue, ad spend, internal documents and the
company's email. Batched at 100 texts per request because the runtime has a
wall-clock limit and a larger request is killed halfway.

Staging does not need this function: the brain is a production tool and staging
carries no corpus.
