import crypto from "node:crypto";

const secret = "lendloop-example-secret";
const timestamp = "1700000000000";
const body = JSON.stringify({
  category: "garden",
  endDate: "2026-11-10",
  loanId: "jd7example",
  startDate: "2026-11-04",
  status: "pending",
  toolName: "Hedge shears",
});
const bodyHash = crypto.createHash("sha256").update(body, "utf8").digest("hex");
const canonical = `v1:${timestamp}:POST:n8n/request:${bodyHash}`;
const signature = crypto.createHmac("sha256", secret).update(canonical, "utf8").digest("hex");

console.log("body      ", body);
console.log("body hash ", bodyHash);
console.log("canonical ", canonical);
console.log("signature ", signature);
