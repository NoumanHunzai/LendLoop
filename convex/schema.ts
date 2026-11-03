import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const loanStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("declined"),
  v.literal("returned"),
  v.literal("cancelled"),
);

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    role: v.union(v.literal("user"), v.literal("admin")),
    trustedLender: v.boolean(),
  }).index("by_clerk", ["clerkId"]),

  tools: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    category: v.string(),
    condition: v.string(),
    description: v.string(),
    removed: v.boolean(),
  }).index("by_owner", ["ownerId"]),

  loans: defineTable({
    toolId: v.id("tools"),
    toolName: v.string(),
    toolCategory: v.string(),
    borrowerId: v.id("users"),
    lenderId: v.id("users"),
    startDate: v.string(),
    endDate: v.string(),
    status: loanStatus,
  })
    .index("by_tool", ["toolId"])
    .index("by_borrower", ["borrowerId"])
    .index("by_lender", ["lenderId"]),

  automationEvents: defineTable({
    loanId: v.id("loans"),
    type: v.union(
      v.literal("notified"),
      v.literal("notify_failed"),
      v.literal("notify_skipped"),
      v.literal("reminder"),
    ),
    message: v.string(),
    idempotencyKey: v.string(),
    createdAt: v.number(),
  })
    .index("by_key", ["idempotencyKey"])
    .index("by_loan", ["loanId"]),
});
