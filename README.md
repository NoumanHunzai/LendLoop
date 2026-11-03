# LendLoop

LendLoop is a neighborhood tool-lending board. Anyone can see which tools are available. A signed-in neighbor can list a tool, ask to borrow one, and answer requests for tools they own.

The app is Next.js (App Router). Clerk handles sign-in. Convex stores the data and enforces who can do what. n8n sends request notices and overdue reminders.

This folder is the whole project. Publish it as its own repository.

## Architecture

```text
Browser  --->  Next.js  --->  Clerk session
                 |
                 +-->  Convex queries and mutations
                         |
                         |  signed webhook, after a request changes
                         v
                       n8n  --HMAC-->  Convex HTTP endpoints
                         |
                         +-->  daily overdue check
                         +-->  error workflow
```

- The public page reads one Convex query. That query returns a tool name and category, and only for tools that are still listed and not out on loan today (UTC).
- Signed-in pages call Convex with the Clerk token. Every create, edit, delete, and loan decision checks the caller inside the Convex function.
- After a borrow request is created or its status changes, Convex signs the notice and POSTs it to n8n. If the webhook is not configured, Convex still saves the loan and records that the notice was skipped.
- Once a day, n8n asks Convex for overdue approved loans, then asks Convex to record one reminder per loan. The loan page shows that as “Reminder sent 2 days ago”.

## Local setup

You need Node.js 20 or newer, npm, and Docker.

### 1. Install

```bash
npm install
```

### 2. Clerk

1. Create an application at [Clerk](https://dashboard.clerk.com).
2. Under **JWT templates**, create the **Convex** template. Leave its name as `convex`. The audience has to stay `convex`.
3. Copy the publishable key and the secret key.
4. Copy the Frontend API URL. It looks like `https://your-app.clerk.accounts.dev`. That value is the Convex issuer domain.

### 3. Convex

```bash
npx convex dev
```

Sign in when it asks, and create a project. The command prints the deployment URL and writes `convex/_generated`. Include that generated folder when you publish the repository. The command keeps running; leave it open while you work.

In another terminal, set the Convex environment:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
npx convex env set ADMIN_CLERK_IDS user_your_clerk_id
npx convex env set N8N_WEBHOOK_SECRET "$(openssl rand -hex 32)"
```

`ADMIN_CLERK_IDS` is a comma-separated list of Clerk user ids (`user_...` from the Clerk dashboard). Open the board once after this is set. The app promotes matching accounts to admin. Clearing the variable later does not demote anyone; change that row in the Convex dashboard if you need to.

`npx convex dev` stops until `CLERK_JWT_ISSUER_DOMAIN` is set. After it is set, signed-in requests use that issuer. The auth config falls back to a non-working placeholder only when the variable is missing at runtime.

The Convex site URL is the deployment URL with `.convex.site` instead of `.convex.cloud`, for example `https://happy-animal-123.convex.site`.

### 4. App environment

```bash
cp .env.example .env.local
cp .env.example .env
```

Fill `.env.local` with the Clerk keys and `NEXT_PUBLIC_CONVEX_URL` from `npx convex dev`.

Fill `.env` with the same `N8N_WEBHOOK_SECRET` you set in Convex, a second random `N8N_ENCRYPTION_KEY` (`openssl rand -hex 32`), and `CONVEX_SITE_URL`.

```bash
npm run dev
```

Open http://localhost:3000. The home page is public. **Sign in to lend or borrow** opens Clerk. After sign-in you land on `/board`.

### 5. n8n

```bash
docker compose up
```

The first visit to http://localhost:5678 asks you to create the n8n owner account. That account stays in the Docker volume.

Import these files from the n8n menu (**Import from file**):

- `n8n/request-notification.json`
- `n8n/overdue-reminders.json`
- `n8n/error-handler.json`

Then, in both the request workflow and the overdue workflow, open the workflow **Settings** and set **Error workflow** to `LendLoop error handler`. The imported files do not hard-code that id, because n8n assigns a new one on import.

Activate **LendLoop request notification**. The production webhook is:

```text
http://localhost:5678/webhook/lendloop-request
```

Convex Cloud cannot call your laptop. Until n8n has a public URL, leave `N8N_REQUEST_WEBHOOK_URL` unset and the board will keep working; loan pages show that the notice was skipped. To receive real notices locally, point a tunnel at port 5678 and then:

```bash
npx convex env set N8N_REQUEST_WEBHOOK_URL https://your-tunnel.example/webhook/lendloop-request
```

Use the production `/webhook/...` path, not `/webhook-test/...`.

The overdue workflow runs at 08:00 UTC. n8n calls Convex directly, so that direction works without a tunnel. You can also run it once from the n8n editor.

`npm run workflows` rewrites the three JSON files from `n8n/build-workflows.mjs`. Import the JSON, not the build script.

## Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `.env.local` | Clerk browser key |
| `CLERK_SECRET_KEY` | `.env.local` | Clerk server key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `.env.local` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `.env.local` | `/sign-up` |
| `NEXT_PUBLIC_CONVEX_URL` | `.env.local` | Convex cloud URL from `npx convex dev` |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex | Clerk Frontend API URL |
| `ADMIN_CLERK_IDS` | Convex | Clerk user ids allowed to be admins |
| `N8N_WEBHOOK_SECRET` | Convex and `.env` | Shared HMAC secret. Same value in both places |
| `N8N_REQUEST_WEBHOOK_URL` | Convex | Public n8n webhook for request notices |
| `N8N_ENCRYPTION_KEY` | `.env` | n8n's own encryption key. Not the HMAC secret |
| `CONVEX_SITE_URL` | `.env` | `https://<deployment>.convex.site` |
| `GENERIC_TIMEZONE`, `TZ` | docker compose | `UTC`, so the daily job and loan dates match |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | docker compose | `false`, so Code nodes can read the two n8n variables |
| `NODE_FUNCTION_ALLOW_BUILTIN` | docker compose | `crypto`, used to sign and verify |
| `N8N_RUNNERS_ENABLED` | docker compose | `false`, so those Code nodes run in-process |
| `WEBHOOK_URL` | docker compose | `http://localhost:5678/` |

Nothing in this list belongs in source code. `.gitignore` excludes `.env`, `.env.local`, and `.env*.local`.

## Security

Permissions live in Convex functions, not in the page. A signed-in user can create, edit, and delete only their own listings. They can approve, decline, or mark returned only when they are the lender, and they can cancel or mark returned only their own borrow requests. Nobody can borrow their own tool. Approving a request is rejected when those dates overlap another approved loan for the same tool. An admin, and only an admin, can remove any listing, read every loan, and mark a neighbor as a trusted lender. The trusted flag is a label on the card. It does not add permissions.

The public query strips every field except name and category. It also hides removed tools and tools that are on loan today. The board does not store email addresses or display Clerk ids. An admin sees the last six characters of a Convex document id so two neighbors can be told apart.

Both directions use the same HMAC. The canonical string is:

```text
v1:<timestamp>:<METHOD>:<logical path>:<sha256 hex of the exact raw body>
```

The signature is HMAC-SHA256 of that string, hex encoded. Send it in `x-lendloop-signature` and the Unix milliseconds in `x-lendloop-timestamp`. A request older or newer than five minutes is rejected. The comparison is timing-safe.

The logical paths are not URLs:

| Call | Method | Logical path | Raw body |
| --- | --- | --- | --- |
| Convex to n8n, request notice | POST | `n8n/request` | The JSON body, with keys in this order: category, endDate, loanId, startDate, status, toolName |
| n8n to Convex, overdue list | GET | `convex/overdue` | Empty string |
| n8n to Convex, reminder write | POST | `convex/reminders` | `{"loanId":"<id>"}` exactly, from `JSON.stringify({ loanId })` |

n8n verifies the webhook's raw bytes. It does not parse the JSON and stringify it again. Convex does the same for the reminder body.

A worked example, using the fake secret `lendloop-example-secret` (this is not a deployed secret):

```text
body      {"category":"garden","endDate":"2026-11-10","loanId":"jd7example","startDate":"2026-11-04","status":"pending","toolName":"Hedge shears"}
canonical v1:1700000000000:POST:n8n/request:074231eb6810ad541f6e1a5264263930a08880bd23ff4b03c1f8e127092de8da
signature 121d889e9913f555aff967aa6dbfd1981c08a333383172a67fab8f8cf2814f12
```

`node scripts/hmac-example.mjs` prints that vector. The SHA-256 of an empty GET body is `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

Notices carry the tool name, category, status, dates, and loan id. They do not carry an email address, because the app never stored one. The overdue list is smaller: loan id, tool name, and end date. The reminder write sends only the loan id.

Reminder writes are idempotent. The server key is `reminder:<loanId>:<UTC date>`. A repeated call on the same day returns `{ "ok": true, "duplicate": true }` and does not insert another event. A notice for the same loan and status is recorded once. Convex tries the request webhook three times, then records a failure that does not include the URL, the secret, or the response body. n8n retries each Convex call three times. A bad signature gets HTTP 401, and the workflow then fails on purpose so the error workflow runs. That workflow keeps the workflow name and the error message, not the request body or headers.

## What would change in production

Use a separate Clerk instance and Convex deployment. Run n8n where Convex can reach it over HTTPS, not on localhost. Rotate `N8N_WEBHOOK_SECRET` and `N8N_ENCRYPTION_KEY`, and restrict who can read n8n executions. Add rate limits on the two Convex HTTP routes. Stop retaining raw webhook bodies in execution history. Claim the notice idempotency key before the HTTP call so two overlapping retries cannot send the same notice twice, and put delivery on a queue instead of calling n8n from the request that saved the loan.

## Checked locally

The public board was opened against a local Convex deployment and showed the empty catalog. Signed-out visits to `/board` are sent to Clerk sign-in. `convex/_generated` is already in the repository. Add your own Clerk and Convex keys with the steps above; the values used for that local check are not in this repository.
