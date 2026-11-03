import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

const verifyRequest = `const crypto = require("crypto");

function rawBody(item) {
  const binary = item.binary && (item.binary.data || item.binary.body);
  if (!binary || !binary.data) return "";
  return Buffer.from(binary.data, "base64").toString("utf8");
}

function signaturesMatch(expected, received) {
  const left = Buffer.from(String(expected).trim().toLowerCase());
  const right = Buffer.from(String(received || "").trim().toLowerCase().replace(/^sha256=/, ""));
  if (left.length === 0 || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

const item = $input.first();
const headers = {};
for (const [key, value] of Object.entries(item.json.headers || {})) {
  headers[String(key).toLowerCase()] = value;
}
const timestamp = String(headers["x-lendloop-timestamp"] || "");
const signature = String(headers["x-lendloop-signature"] || "");
const secret = process.env.N8N_WEBHOOK_SECRET || "";
const raw = rawBody(item);
const bodyHash = crypto.createHash("sha256").update(raw, "utf8").digest("hex");
const canonical = "v1:" + timestamp + ":POST:n8n/request:" + bodyHash;
const expected = secret ? crypto.createHmac("sha256", secret).update(canonical, "utf8").digest("hex") : "";
const skew = Math.abs(Date.now() - Number(timestamp));
const ok = Boolean(secret && raw)
  && Number.isFinite(Number(timestamp))
  && skew <= 5 * 60 * 1000
  && signaturesMatch(expected, signature);

let notice = null;
if (ok) {
  const body = JSON.parse(raw);
  notice = {
    category: body.category,
    endDate: body.endDate,
    loanId: body.loanId,
    startDate: body.startDate,
    status: body.status,
    toolName: body.toolName,
  };
}

return [{ json: { ok, notice } }];
`;

const recordNotice = `const notice = $json.notice;
if (!notice) throw new Error("LendLoop had no notice to record.");
return [{ json: notice }];
`;

const rejectRequest = `throw new Error("LendLoop rejected a request notification.");
`;

const signOverdue = `const crypto = require("crypto");
const secret = process.env.N8N_WEBHOOK_SECRET || "";
const base = String(process.env.CONVEX_SITE_URL || "").replace(/[/]$/, "");
if (!secret || !base) throw new Error("N8N_WEBHOOK_SECRET and CONVEX_SITE_URL must be set.");
const timestamp = Date.now().toString();
const bodyHash = crypto.createHash("sha256").update("", "utf8").digest("hex");
const canonical = "v1:" + timestamp + ":GET:convex/overdue:" + bodyHash;
const signature = crypto.createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
return [{ json: { timestamp, signature, url: base + "/n8n/overdue" } }];
`;

const splitLoans = `const loans = Array.isArray($json.loans) ? $json.loans : [];
return loans
  .filter((loan) => loan && loan.loanId)
  .map((loan) => ({ json: { loanId: loan.loanId, toolName: loan.toolName, endDate: loan.endDate } }));
`;

const signReminder = `const crypto = require("crypto");
const secret = process.env.N8N_WEBHOOK_SECRET || "";
const base = String(process.env.CONVEX_SITE_URL || "").replace(/[/]$/, "");
if (!secret || !base) throw new Error("N8N_WEBHOOK_SECRET and CONVEX_SITE_URL must be set.");
const raw = JSON.stringify({ loanId: $json.loanId });
const timestamp = Date.now().toString();
const bodyHash = crypto.createHash("sha256").update(raw, "utf8").digest("hex");
const canonical = "v1:" + timestamp + ":POST:convex/reminders:" + bodyHash;
const signature = crypto.createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
return [{ json: { timestamp, signature, raw, url: base + "/n8n/reminders" } }];
`;

const recordFailure = `const workflow = $json.workflow || {};
const execution = $json.execution || {};
const error = execution.error || {};
return [{
  json: {
    workflow: workflow.name || "unknown",
    message: error.message || "Workflow failed",
  },
}];
`;

function node(id, name, type, typeVersion, position, parameters, extra = {}) {
  return { id, name, type, typeVersion, position, parameters, ...extra };
}

function connect(map, from, to, output = 0) {
  map[from] ??= { main: [] };
  map[from].main[output] ??= [];
  map[from].main[output].push({ node: to, type: "main", index: 0 });
}

function workflow(name, id, nodes, connections) {
  return {
    name,
    nodes,
    connections,
    pinData: {},
    settings: { executionOrder: "v1" },
    staticData: null,
    meta: { templateCredsSetupCompleted: true },
    id,
  };
}

const requestConnections = {};
connect(requestConnections, "Request webhook", "Verify signature");
connect(requestConnections, "Verify signature", "Accepted?");
connect(requestConnections, "Accepted?", "Record notice", 0);
connect(requestConnections, "Accepted?", "Reject", 1);
connect(requestConnections, "Record notice", "Accept response");
connect(requestConnections, "Reject", "Report rejection");

const requestWorkflow = workflow(
  "LendLoop request notification",
  "b1c0a7e2-6d44-4a1e-9c31-0a6e5f2d1001",
  [
    node("a1000000-0000-4000-8000-000000000001", "Request webhook", "n8n-nodes-base.webhook", 2, [240, 300], {
      httpMethod: "POST",
      path: "lendloop-request",
      responseMode: "responseNode",
      options: { rawBody: true },
    }, { webhookId: "c1000000-0000-4000-8000-000000000001" }),
    node("a1000000-0000-4000-8000-000000000002", "Verify signature", "n8n-nodes-base.code", 2, [480, 300], { jsCode: verifyRequest }),
    node("a1000000-0000-4000-8000-000000000003", "Accepted?", "n8n-nodes-base.if", 2.2, [720, 300], {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict" },
        conditions: [{
          id: "signature-ok",
          leftValue: "={{ $json.ok }}",
          rightValue: "",
          operator: { type: "boolean", operation: "true" },
        }],
        combinator: "and",
      },
    }),
    node("a1000000-0000-4000-8000-000000000004", "Record notice", "n8n-nodes-base.code", 2, [980, 180], { jsCode: recordNotice }),
    node("a1000000-0000-4000-8000-000000000005", "Accept response", "n8n-nodes-base.respondToWebhook", 1.1, [1200, 180], {
      respondWith: "json",
      responseBody: "={{ JSON.stringify({ ok: true }) }}",
      options: { responseCode: 200 },
    }),
    node("a1000000-0000-4000-8000-000000000006", "Reject", "n8n-nodes-base.respondToWebhook", 1.1, [980, 420], {
      respondWith: "json",
      responseBody: "={{ JSON.stringify({ ok: false }) }}",
      options: { responseCode: 401 },
    }),
    node("a1000000-0000-4000-8000-000000000007", "Report rejection", "n8n-nodes-base.code", 2, [1200, 420], { jsCode: rejectRequest }),
  ],
  requestConnections,
);

const overdueConnections = {};
connect(overdueConnections, "Daily at 08:00 UTC", "Sign overdue request");
connect(overdueConnections, "Sign overdue request", "Fetch overdue loans");
connect(overdueConnections, "Fetch overdue loans", "Split loans");
connect(overdueConnections, "Split loans", "Sign reminder");
connect(overdueConnections, "Sign reminder", "Write reminder");

const overdueWorkflow = workflow(
  "LendLoop overdue reminders",
  "b1c0a7e2-6d44-4a1e-9c31-0a6e5f2d1002",
  [
    node("a2000000-0000-4000-8000-000000000001", "Daily at 08:00 UTC", "n8n-nodes-base.scheduleTrigger", 1.2, [240, 300], {
      rule: { interval: [{ field: "cronExpression", expression: "0 8 * * *" }] },
    }),
    node("a2000000-0000-4000-8000-000000000002", "Sign overdue request", "n8n-nodes-base.code", 2, [480, 300], { jsCode: signOverdue }),
    node("a2000000-0000-4000-8000-000000000003", "Fetch overdue loans", "n8n-nodes-base.httpRequest", 4.2, [740, 300], {
      method: "GET",
      url: "={{ $json.url }}",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "x-lendloop-timestamp", value: "={{ $json.timestamp }}" },
          { name: "x-lendloop-signature", value: "={{ $json.signature }}" },
        ],
      },
      options: { timeout: 10000 },
    }, { retryOnFail: true, maxTries: 3, waitBetweenTries: 1000 }),
    node("a2000000-0000-4000-8000-000000000004", "Split loans", "n8n-nodes-base.code", 2, [980, 300], { jsCode: splitLoans }),
    node("a2000000-0000-4000-8000-000000000005", "Sign reminder", "n8n-nodes-base.code", 2, [1200, 300], { jsCode: signReminder }),
    node("a2000000-0000-4000-8000-000000000006", "Write reminder", "n8n-nodes-base.httpRequest", 4.2, [1440, 300], {
      method: "POST",
      url: "={{ $json.url }}",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "content-type", value: "application/json" },
          { name: "x-lendloop-timestamp", value: "={{ $json.timestamp }}" },
          { name: "x-lendloop-signature", value: "={{ $json.signature }}" },
        ],
      },
      sendBody: true,
      contentType: "raw",
      rawContentType: "application/json",
      body: "={{ $json.raw }}",
      options: { timeout: 10000 },
    }, { retryOnFail: true, maxTries: 3, waitBetweenTries: 1000 }),
  ],
  overdueConnections,
);

const errorConnections = {};
connect(errorConnections, "Error trigger", "Keep failure summary");

const errorWorkflow = workflow(
  "LendLoop error handler",
  "b1c0a7e2-6d44-4a1e-9c31-0a6e5f2d1003",
  [
    node("a3000000-0000-4000-8000-000000000001", "Error trigger", "n8n-nodes-base.errorTrigger", 1, [240, 300], {}),
    node("a3000000-0000-4000-8000-000000000002", "Keep failure summary", "n8n-nodes-base.code", 2, [520, 300], { jsCode: recordFailure }),
  ],
  errorConnections,
);

writeFileSync(join(root, "request-notification.json"), JSON.stringify(requestWorkflow, null, 2) + "\n");
writeFileSync(join(root, "overdue-reminders.json"), JSON.stringify(overdueWorkflow, null, 2) + "\n");
writeFileSync(join(root, "error-handler.json"), JSON.stringify(errorWorkflow, null, 2) + "\n");
