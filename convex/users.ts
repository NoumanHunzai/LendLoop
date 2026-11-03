import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;
    return { id: user._id, role: user.role, trustedLender: user.trustedLender };
  },
});

export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Sign in required.");
    const adminIds = (process.env.ADMIN_CLERK_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (existing) {
      if (adminIds.includes(identity.subject) && existing.role !== "admin") {
        await ctx.db.patch(existing._id, { role: "admin" });
      }
      return existing._id;
    }
    return await ctx.db.insert("users", {
      clerkId: identity.subject,
      role: adminIds.includes(identity.subject) ? "admin" : "user",
      trustedLender: false,
    });
  },
});
