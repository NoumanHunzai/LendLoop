import { ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type Ctx = QueryCtx | MutationCtx;

export function fail(message: string): never {
  throw new ConvexError(message);
}

export function utcDate(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function rangesOverlap(
  startA: string,
  endA: string,
  startB: string,
  endB: string,
): boolean {
  return startA <= endB && startB <= endA;
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) fail("Sign in required.");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk", (q) => q.eq("clerkId", identity.subject))
    .unique();
  if (!user) fail("Your profile is still being created. Refresh and try again.");
  return user;
}

export async function approvedLoansForTool(ctx: Ctx, toolId: Id<"tools">) {
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_tool", (q) => q.eq("toolId", toolId))
    .collect();
  return loans.filter((loan) => loan.status === "approved");
}

export function availabilityOn(
  loans: Doc<"loans">[],
  day: string,
): "available" | "on_loan" | "reserved" {
  if (loans.some((loan) => loan.startDate <= day && loan.endDate >= day)) return "on_loan";
  if (loans.some((loan) => loan.startDate > day)) return "reserved";
  return "available";
}
