import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { PATHS } from "./constants";
import {
  canonicalString,
  freshTimestamp,
  signPayload,
  SIGNATURE_HEADER,
  signaturesMatch,
  TIMESTAMP_HEADER,
} from "./hmac";
import { utcDate } from "./authz";

const http = httpRouter();

http.route({
  path: "/n8n/overdue",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const authorized = await authorizedRequest(request, "GET", PATHS.overdue, "");
    if (!authorized) return json({ error: "unauthorized" }, 401);
    const loans = await ctx.runQuery(internal.reminders.overdue, { day: utcDate() });
    return json({ loans });
  }),
});

http.route({
  path: "/n8n/reminders",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text();
    const authorized = await authorizedRequest(request, "POST", PATHS.reminder, raw);
    if (!authorized) return json({ error: "unauthorized" }, 401);
    let loanId = "";
    try {
      const body = JSON.parse(raw) as { loanId?: string };
      loanId = body.loanId ?? "";
    } catch {
      return json({ error: "invalid json" }, 400);
    }
    if (!loanId) return json({ error: "loanId is required" }, 400);
    try {
      const result = await ctx.runMutation(internal.reminders.mark, {
        loanId: loanId as Id<"loans">,
        day: utcDate(),
      });
      return json(result);
    } catch {
      return json({ error: "unknown loan" }, 400);
    }
  }),
});

export default http;

async function authorizedRequest(
  request: Request,
  method: string,
  path: string,
  body: string,
) {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) return false;
  const timestamp = request.headers.get(TIMESTAMP_HEADER) ?? "";
  const signature = request.headers.get(SIGNATURE_HEADER) ?? "";
  if (!freshTimestamp(timestamp)) return false;
  const canonical = await canonicalString({ timestamp, method, path, body });
  const expected = await signPayload(secret, canonical);
  return signaturesMatch(expected, signature);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
