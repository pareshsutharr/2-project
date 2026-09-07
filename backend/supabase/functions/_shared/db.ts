import postgres from "npm:postgres@3.4.5";

// Auto-injected by the Edge Functions runtime for every deployed function — no secret to set.
const connectionString = Deno.env.get("SUPABASE_DB_URL");
if (!connectionString) {
  throw new Error("SUPABASE_DB_URL env var is required");
}

// Edge Functions are short-lived per invocation, but the underlying Deno isolate
// is often reused across nearby invocations — a module-level singleton lets those
// share one small connection pool instead of opening a fresh connection every call.
export const sql = postgres(connectionString, { max: 3, prepare: false });
