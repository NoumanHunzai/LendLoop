import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { fail, requireUser } from "./authz";

export const overview = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.role !== "admin") fail("Admin access is required.");
    const users = await ctx.db.query("users").collect();
    const loans = await ctx.db.query("loans").collect();
    return {
      lenders: users.map((entry) => ({
        id: entry._id,
        role: entry.role,
        trustedLender: entry.trustedLender,
      })),
      loans: loans
        .sort((a, b) => b._creationTime - a._creationTime)
        .map((loan) => ({
          id: loan._id,
          toolName: loan.toolName,
          toolCategory: loan.toolCategory,
          startDate: loan.startDate,
          endDate: loan.endDate,
          status: loan.status,
        })),
    };
  },
});

export const setTrusted = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    if (user.role !== "admin") fail("Admin access is required.");
    const lender = await ctx.db.get(args.userId);
    if (!lender) fail("That neighbor no longer exists.");
    await ctx.db.patch(lender._id, { trustedLender: args.trusted });
  },
});
