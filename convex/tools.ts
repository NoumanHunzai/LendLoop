import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { availabilityOn, approvedLoansForTool, fail, requireUser, utcDate } from "./authz";
import { CATEGORIES, CONDITIONS } from "./constants";
import { scheduleNotice } from "./notify";

const category = v.union(
  v.literal("power tools"),
  v.literal("garden"),
  v.literal("kitchen"),
  v.literal("camping"),
  v.literal("other"),
);
const condition = v.union(v.literal("excellent"), v.literal("good"), v.literal("fair"));

function cleanText(value: string, label: string, max: number) {
  const text = value.trim();
  if (!text) fail(`${label} is required.`);
  if (text.length > max) fail(`${label} must be ${max} characters or fewer.`);
  return text;
}

export const catalog = query({
  args: {},
  handler: async (ctx) => {
    const day = utcDate();
    const tools = await ctx.db.query("tools").collect();
    const visible = [];
    for (const tool of tools) {
      if (tool.removed) continue;
      const loans = await approvedLoansForTool(ctx, tool._id);
      if (availabilityOn(loans, day) === "on_loan") continue;
      visible.push({ name: tool.name, category: tool.category });
    }
    visible.sort((a, b) => a.name.localeCompare(b.name) || a.category.localeCompare(b.category));
    return visible;
  },
});

export const list = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const day = utcDate();
    const tools = await ctx.db.query("tools").collect();
    const rows = [];
    for (const tool of tools) {
      if (tool.removed) continue;
      if (args.category && tool.category !== args.category) continue;
      const owner = await ctx.db.get(tool.ownerId);
      const loans = await approvedLoansForTool(ctx, tool._id);
      rows.push({
        id: tool._id,
        name: tool.name,
        category: tool.category,
        condition: tool.condition,
        description: tool.description,
        availability: availabilityOn(loans, day),
        mine: tool.ownerId === user._id,
        trustedLender: owner?.trustedLender ?? false,
      });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return { categories: CATEGORIES, conditions: CONDITIONS, tools: rows };
  },
});

export const create = mutation({
  args: { name: v.string(), category, condition, description: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    return await ctx.db.insert("tools", {
      ownerId: user._id,
      name: cleanText(args.name, "Name", 80),
      category: args.category,
      condition: args.condition,
      description: cleanText(args.description, "Description", 400),
      removed: false,
    });
  },
});

export const update = mutation({
  args: {
    toolId: v.id("tools"),
    name: v.string(),
    category,
    condition,
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.removed) fail("That listing is no longer available.");
    if (tool.ownerId !== user._id) fail("You can edit only your own listings.");
    await ctx.db.patch(tool._id, {
      name: cleanText(args.name, "Name", 80),
      category: args.category,
      condition: args.condition,
      description: cleanText(args.description, "Description", 400),
    });
  },
});

export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.removed) fail("That listing is no longer available.");
    if (tool.ownerId !== user._id && user.role !== "admin") {
      fail("You can delete only your own listings.");
    }
    await ctx.db.patch(tool._id, { removed: true });
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_tool", (q) => q.eq("toolId", tool._id))
      .collect();
    for (const loan of loans) {
      if (loan.status !== "pending") continue;
      await ctx.db.patch(loan._id, { status: "cancelled" });
      await scheduleNotice(ctx, loan._id);
    }
  },
});
