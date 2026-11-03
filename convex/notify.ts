import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";

export async function scheduleNotice(ctx: MutationCtx, loanId: Id<"loans">) {
  await ctx.scheduler.runAfter(0, internal.notifications.deliver, { loanId });
}
