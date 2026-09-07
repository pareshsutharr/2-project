// Internal-only: invoked every 5 seconds by pg_cron (see migration), authenticated with the
// project's service_role key. Never called by the frontend — verify_jwt stays at its default
// (true), which accepts that service_role-signed request.
import { runTick } from "../_shared/autoTradeService.ts";

Deno.serve(async (_req) => {
  try {
    await runTick();
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error("auto-trade-tick failed:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
