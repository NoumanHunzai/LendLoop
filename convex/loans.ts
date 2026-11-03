import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { fail, rangesOverlap, requireUser, utcDate } from "./authz";
import { scheduleNotice } from "./notify";

async function eventsFor(ctx: QueryCtx, loanId: Id<"loans">) {
  const events = await ctx.db
    .query("automationEvents")
    .withIndex("by_loan", (q) => q.eq("loanId", loanId))
    .collect();
  return events
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((event) => ({
      type: event.type,
      message: event.message,
      createdAt: event.createdAt,
    }));
}

function present(loan: Doc<"loans">, events: Awaited<ReturnType<typeof eventsFor>>) {
  return {
    id: loan._id,
    toolName: loan.toolName,
    toolCategory: loan.toolCategory,
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    events,
  };
}

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", user._id))
      .collect();
    const rows = [];
    for (const loan of loans) rows.push(present(loan, await eventsFor(ctx, loan._id)));
    rows.sort((a, b) => b.startDate.localeCompare(a.startDate));
    return rows;
  },
});

export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", user._id))
      .collect();
    const rows = [];
    for (const loan of loans) rows.push(present(loan, await eventsFor(ctx, loan._id)));
    rows.sort((a, b) => b.startDate.localeCompare(a.startDate));
    return rows;
  },
});

export const request = mutation({
  args: {
    toolId: v.id("tools"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const day = utcDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(args.endDate)) {
      fail("Choose a start and end date.");
    }
    if (args.startDate < day) fail("The loan cannot start in the past.");
    if (args.endDate < args.startDate) fail("The return date must be on or after the start date.");
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.removed) fail("That listing is no longer available.");
    if (tool.ownerId === user._id) fail("You cannot borrow your own tool.");
    const loanId = await ctx.db.insert("loans", {
      toolId: tool._id,
      toolName: tool.name,
      toolCategory: tool.category,
      borrowerId: user._id,
      lenderId: tool.ownerId,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "pending",
    });
    await scheduleNotice(ctx, loanId);
    return loanId;
  },
});

export const decide = mutation({
  args: {
    loanId: v.id("loans"),
    decision: v.union(v.literal("approved"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) fail("That request no longer exists.");
    if (loan.lenderId !== user._id) fail("Only the lender can answer this request.");
    if (loan.status !== "pending") fail("This request has already been answered.");
    if (args.decision === "approved") {
      const approved = await ctx.db
        .query("loans")
        .withIndex("by_tool", (q) => q.eq("toolId", loan.toolId))
        .collect();
      const clash = approved.some(
        (other) =>
          other.status === "approved" &&
          rangesOverlap(loan.startDate, loan.endDate, other.startDate, other.endDate),
      );
      if (clash) fail("Those dates overlap a loan you already approved.");
    }
    await ctx.db.patch(loan._id, { status: args.decision });
    await scheduleNotice(ctx, loan._id);
  },
});

export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) fail("That loan no longer exists.");
    const involved = loan.lenderId === user._id || loan.borrowerId === user._id;
    if (!involved) fail("You can update only loans you are part of.");
    if (loan.status !== "approved") fail("Only an approved loan can be marked returned.");
    await ctx.db.patch(loan._id, { status: "returned" });
    await scheduleNotice(ctx, loan._id);
  },
});

export const cancel = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) fail("That request no longer exists.");
    if (loan.borrowerId !== user._id) fail("You can cancel only your own requests.");
    if (loan.status !== "pending") fail("Only a pending request can be cancelled.");
    await ctx.db.patch(loan._id, { status: "cancelled" });
    await scheduleNotice(ctx, loan._id);
  },
});
