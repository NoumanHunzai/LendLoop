import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const overdue = internalQuery({
  args: { day: v.string() },
  handler: async (ctx, args) => {
    const loans = await ctx.db.query("loans").collect();
    const due = [];
    for (const loan of loans) {
      if (loan.status !== "approved" || loan.endDate >= args.day) continue;
      const key = `reminder:${loan._id}:${args.day}`;
      const existing = await ctx.db
        .query("automationEvents")
        .withIndex("by_key", (q) => q.eq("idempotencyKey", key))
        .unique();
      if (existing) continue;
      due.push({
        loanId: loan._id,
        toolName: loan.toolName,
        endDate: loan.endDate,
      });
    }
    return due;
  },
});

export const mark = internalMutation({
  args: { loanId: v.id("loans"), day: v.string() },
  handler: async (ctx, args) => {
    const loan = await ctx.db.get(args.loanId);
    if (!loan) return { ok: false, reason: "unknown loan" };
    if (loan.status !== "approved" || loan.endDate >= args.day) {
      return { ok: false, reason: "not overdue" };
    }
    const key = `reminder:${loan._id}:${args.day}`;
    const existing = await ctx.db
      .query("automationEvents")
      .withIndex("by_key", (q) => q.eq("idempotencyKey", key))
      .unique();
    if (existing) return { ok: true, duplicate: true };
    await ctx.db.insert("automationEvents", {
      loanId: loan._id,
      type: "reminder",
      message: "Reminder sent",
      idempotencyKey: key,
      createdAt: Date.now(),
    });
    return { ok: true, duplicate: false };
  },
});
