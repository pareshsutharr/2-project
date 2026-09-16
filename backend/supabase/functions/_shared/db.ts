import postgres from "npm:postgres@3.4.5";

// Auto-injected by the Edge Functions runtime for every deployed function — no secret to set.
const connectionString = Deno.env.get("SUPABASE_DB_URL");
if (!connectionString) {
  throw new Error("SUPABASE_DB_URL env var is required");
}

// Edge Functions are short-lived per invocation, but the underlying Deno isolate
// is often reused across nearby invocations — a module-level singleton lets those
// share one small connection pool instead of opening a fresh connection every call.
//
// Edge Functions also scale out under concurrent traffic by spinning up additional isolates,
// each with its own copy of this pool — so `max` here is a per-isolate cap, not a global one.
// Keeping it at 1 minimizes how many connections a single burst of isolates can open against
// Supabase's shared pooler/connection ceiling (queries within one request already run
// sequentially, so a single connection doesn't add latency there). `idle_timeout` releases
// that connection quickly once a request finishes instead of holding it open between polls.
export const sql = postgres(connectionString, {
  max: 1,
  idle_timeout: 10,
  connect_timeout: 10,
  prepare: false,
});
