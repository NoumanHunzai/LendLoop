import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { PATHS } from "./constants";
import { canonicalString, signPayload, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "./hmac";

export const load = internalQuery({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.loanId);
    if (!loan) return null;
    return {
      loanId: loan._id,
      status: loan.status,
      toolName: loan.toolName,
      category: loan.toolCategory,
      startDate: loan.startDate,
      endDate: loan.endDate,
    };
  },
});

export const eventByKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.key))
      .unique();
  },
});

export const record = internalMutation({
  args: {
    loanId: v.id("loans"),
    type: v.union(
      v.literal("notified"),
      v.literal("notify_failed"),
      v.literal("notify_skipped"),
      v.literal("reminder"),
    ),
    message: v.string(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing) return { duplicate: true };
    await ctx.db.insert("automationEvents", {
      loanId: args.loanId,
      type: args.type,
      message: args.message.slice(0, 180),
      idempotencyKey: args.idempotencyKey,
      createdAt: Date.now(),
    });
    return { duplicate: false };
  },
});

export const deliver = internalAction({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const loan = await ctx.runQuery(internal.notifications.load, { loanId: args.loanId });
    if (!loan) return;
    const key = `notify:${loan.loanId}:${loan.status}`;
    const existing = await ctx.runQuery(internal.notifications.eventByKey, { key });
    if (existing) return;

    const url = process.env.N8N_REQUEST_WEBHOOK_URL;
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!url || !secret || !/^https?:\/\//.test(url)) {
      await ctx.runMutation(internal.notifications.record, {
        loanId: loan.loanId,
        type: "notify_skipped",
        message: "Automation URL or signing secret is not configured.",
        idempotencyKey: `notify-skipped:${loan.loanId}:${loan.status}`,
      });
      return;
    }

    const raw = JSON.stringify({
      category: loan.category,
      endDate: loan.endDate,
      loanId: loan.loanId,
      startDate: loan.startDate,
      status: loan.status,
      toolName: loan.toolName,
    });
    const timestamp = Date.now().toString();
    const canonical = await canonicalString({
      timestamp,
      method: "POST",
      path: PATHS.n8nRequest,
      body: raw,
    });
    const signature = await signPayload(secret, canonical);
    let lastError = "The automation call failed.";
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [TIMESTAMP_HEADER]: timestamp,
            [SIGNATURE_HEADER]: signature,
          },
          body: raw,
        });
        if (response.ok) {
          await ctx.runMutation(internal.notifications.record, {
            loanId: loan.loanId,
            type: "notified",
            message: `Status “${loan.status}” was sent to automation.`,
            idempotencyKey: key,
          });
          return;
        }
        lastError = `Automation returned HTTP ${response.status} on attempt ${attempt}.`;
      } catch {
        lastError = `Automation could not be reached on attempt ${attempt}.`;
      }
    }
    await ctx.runMutation(internal.notifications.record, {
      loanId: loan.loanId,
      type: "notify_failed",
      message: lastError,
      idempotencyKey: `notify-failed:${loan.loanId}:${loan.status}:${Date.now()}`,
    });
  },
});
