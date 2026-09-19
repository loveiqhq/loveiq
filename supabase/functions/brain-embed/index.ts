import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * Embeddings for the company brain, computed IN Supabase.
 *
 * `gte-small` ships with the edge runtime: 384 dimensions, no API key, no
 * per-token bill, no rate limit and no third party seeing the corpus. That last
 * point is why it is not OpenAI — the brain holds revenue, ad spend, every internal
 * document and now the company's email.
 *
 * Batched because the caller has ~21,000 chunks to embed and one HTTP round trip
 * per chunk would take hours.
 */

// deno-lint-ignore no-explicit-any
const session = new (globalThis as any).Supabase.ai.Session("gte-small");

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let texts: string[];
  try {
    const body = (await req.json()) as { texts?: unknown };
    if (!Array.isArray(body.texts)) throw new Error("texts must be an array of strings");
    texts = body.texts.map((t) => String(t ?? ""));
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // A cap the CALLER cannot exceed by accident: the runtime has a wall-clock limit,
  // and a 5,000-item request would be killed halfway with nothing to show for it.
  if (texts.length > 100) {
    return new Response(JSON.stringify({ error: "at most 100 texts per request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const embeddings: number[][] = [];
    for (const text of texts) {
      // `mean_pool` + `normalize` is what makes the output a UNIT vector, so cosine
      // distance and inner product agree and the index can use either.
      const vec = (await session.run(text.slice(0, 8000), {
        mean_pool: true,
        normalize: true,
      })) as number[];
      embeddings.push(vec);
    }
    return new Response(JSON.stringify({ embeddings, dims: embeddings[0]?.length ?? 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
