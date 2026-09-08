import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.115.0";
import { MAX_CANDIDATES, chunks, cutoffIso, isOwnedThumbnailPath } from "./cleanup-core.mjs";

const jsonHeaders = { "Content-Type": "application/json" };

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!projectUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing server configuration" }), { status: 500, headers: jsonHeaders });
  }

  const client = createClient(projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const cutoff = cutoffIso();
  const { data, error } = await client.rpc("get_product_thumbnail_cleanup_candidates", {
    p_cutoff: cutoff,
    p_limit: MAX_CANDIDATES,
  });
  if (error) {
    console.error("Could not load thumbnail cleanup candidates", error);
    return new Response(JSON.stringify({ error: "Could not load cleanup candidates" }), { status: 500, headers: jsonHeaders });
  }

  const candidates = (data || []).filter(isOwnedThumbnailPath);
  let removed = 0;
  let finalized = 0;
  const failures: Array<{ itemId: string; stage: string }> = [];

  for (const batch of chunks(candidates)) {
    const paths = batch.map((row) => row.thumbnail_path);
    const removal = await client.storage.from("product-thumbnails").remove(paths);
    if (removal.error) {
      console.error("Could not remove thumbnail batch", removal.error);
      batch.forEach((row) => failures.push({ itemId: row.item_id, stage: "storage" }));
      continue;
    }
    removed += batch.length;

    for (const row of batch) {
      const result = await client.rpc("finalize_product_thumbnail_cleanup", {
        p_item_id: row.item_id,
        p_expected_path: row.thumbnail_path,
        p_deleted_at: new Date().toISOString(),
      });
      if (result.error || result.data !== true) {
        if (result.error) console.error("Could not finalize thumbnail cleanup", result.error);
        failures.push({ itemId: row.item_id, stage: "database" });
      } else {
        finalized += 1;
      }
    }
  }

  return new Response(JSON.stringify({ cutoff, candidates: candidates.length, removed, finalized, failures }), {
    status: failures.length ? 207 : 200,
    headers: jsonHeaders,
  });
});
