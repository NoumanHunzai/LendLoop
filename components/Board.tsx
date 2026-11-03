"use client";

import { useMutation, useQuery } from "convex/react";
import { FormEvent, ReactNode, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type View = "tools" | "listings" | "requests" | "incoming" | "admin";

const views: { id: View; label: string }[] = [
  { id: "tools", label: "All tools" },
  { id: "listings", label: "My listings" },
  { id: "requests", label: "My requests" },
  { id: "incoming", label: "Incoming requests" },
  { id: "admin", label: "Admin" },
];

export function Board() {
  const [view, setView] = useState<View>("tools");
  const me = useQuery(api.users.me);

  return (
    <>
      <nav className="views">
        {views
          .filter((item) => item.id !== "admin" || me?.role === "admin")
          .map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={view === item.id ? "active" : ""}
              onClick={(event) => {
                event.preventDefault();
                setView(item.id);
              }}
            >
              {item.label}
            </a>
          ))}
      </nav>
      {me === undefined ? <p>Loading your board…</p> : null}
      {me === null ? <p>Your account is still being created. Refresh in a moment.</p> : null}
      {me && view === "tools" ? <AllTools /> : null}
      {me && view === "listings" ? <MyListings /> : null}
      {me && view === "requests" ? <MyRequests /> : null}
      {me && view === "incoming" ? <Incoming /> : null}
      {me && view === "admin" && me.role === "admin" ? <Admin /> : null}
    </>
  );
}

function AllTools() {
  const [category, setCategory] = useState("");
  const data = useQuery(api.tools.list, category ? { category } : {});
  const requestLoan = useMutation(api.loans.request);
  const [message, setMessage] = useState("");

  if (!data) return <p>Loading tools…</p>;

  return (
    <section>
      <label>
        Category
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">All categories</option>
          {data.categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </label>
      {message ? <p className="error">{message}</p> : null}
      <div className="grid">
        {data.tools.map((tool) => (
          <article className="card" key={tool.id}>
            <h2>{tool.name}</h2>
            <p>
              <span className="badge">{tool.category}</span>
              <span className={`badge ${tool.availability === "available" ? "good" : "warn"}`}>
                {tool.availability === "on_loan" ? "on loan" : tool.availability}
              </span>
            </p>
            <p className="meta">
              {tool.condition}
              {tool.mine ? " · Your listing" : " · Neighbor"}
              {tool.trustedLender ? " · Trusted lender" : ""}
            </p>
            <p>{tool.description}</p>
            {tool.mine || tool.availability === "on_loan" ? null : (
              <form
                onSubmit={(event) => {
                  const form = event.currentTarget;
                  const startDate = String(new FormData(form).get("startDate") ?? "");
                  const endDate = String(new FormData(form).get("endDate") ?? "");
                  void submit(event, async () => {
                    await requestLoan({ toolId: tool.id, startDate, endDate });
                    form.reset();
                    setMessage("Request sent.");
                  }, setMessage);
                }}
              >
                <label>
                  From
                  <input name="startDate" type="date" required />
                </label>
                <label>
                  Until
                  <input name="endDate" type="date" required />
                </label>
                <button type="submit">Request to borrow</button>
                <p className="meta">Dates are UTC.</p>
              </form>
            )}
          </article>
        ))}
      </div>
      {data.tools.length === 0 ? <p>No tools in this category.</p> : null}
    </section>
  );
}

function MyListings() {
  const data = useQuery(api.tools.list, {});
  const create = useMutation(api.tools.create);
  const update = useMutation(api.tools.update);
  const remove = useMutation(api.tools.remove);
  const [message, setMessage] = useState("");

  if (!data) return <p>Loading your listings…</p>;
  const mine = data.tools.filter((tool) => tool.mine);

  return (
    <section className="grid">
      <form
        className="card"
        onSubmit={(event) => {
          const form = event.currentTarget;
          const fields = readTool(form);
          void submit(event, async () => {
            await create(fields);
            form.reset();
            setMessage("Listing added.");
          }, setMessage);
        }}
      >
        <h2>List a tool</h2>
        <ToolFields categories={data.categories} conditions={data.conditions} />
        <button type="submit">Publish listing</button>
        {message ? <p className="error">{message}</p> : null}
      </form>
      {mine.map((tool) => (
        <form
          className="card"
          key={tool.id}
          onSubmit={(event) => {
            const fields = readTool(event.currentTarget);
            void submit(event, async () => {
              await update({ toolId: tool.id, ...fields });
              setMessage("Listing updated.");
            }, setMessage);
          }}
        >
          <h2>Your listing</h2>
          <ToolFields
            categories={data.categories}
            conditions={data.conditions}
            name={tool.name}
            category={tool.category}
            condition={tool.condition}
            description={tool.description}
          />
          <div className="row">
            <button type="submit">Save</button>
            <button
              className="quiet"
              type="button"
              onClick={() => {
                void remove({ toolId: tool.id }).catch((error: unknown) => {
                  setMessage(errorText(error));
                });
              }}
            >
              Delete
            </button>
          </div>
        </form>
      ))}
    </section>
  );
}

function MyRequests() {
  const loans = useQuery(api.loans.mine);
  const markReturned = useMutation(api.loans.markReturned);
  const cancel = useMutation(api.loans.cancel);
  return (
    <LoanList
      loans={loans}
      empty="You have not requested anything yet."
      actions={(loan, setMessage) => (
        <div className="row">
          {loan.status === "pending" ? (
            <button className="quiet" type="button" onClick={() => run(() => cancel({ loanId: loan.id }), setMessage)}>
              Cancel
            </button>
          ) : null}
          {loan.status === "approved" ? (
            <button type="button" onClick={() => run(() => markReturned({ loanId: loan.id }), setMessage)}>
              Mark returned
            </button>
          ) : null}
        </div>
      )}
    />
  );
}

function Incoming() {
  const loans = useQuery(api.loans.incoming);
  const decide = useMutation(api.loans.decide);
  const markReturned = useMutation(api.loans.markReturned);
  return (
    <LoanList
      loans={loans}
      empty="Nobody has asked to borrow your tools."
      actions={(loan, setMessage) => (
        <div className="row">
          {loan.status === "pending" ? (
            <>
              <button type="button" onClick={() => run(() => decide({ loanId: loan.id, decision: "approved" }), setMessage)}>
                Approve
              </button>
              <button className="quiet" type="button" onClick={() => run(() => decide({ loanId: loan.id, decision: "declined" }), setMessage)}>
                Decline
              </button>
            </>
          ) : null}
          {loan.status === "approved" ? (
            <button type="button" onClick={() => run(() => markReturned({ loanId: loan.id }), setMessage)}>
              Mark returned
            </button>
          ) : null}
        </div>
      )}
    />
  );
}

function Admin() {
  const overview = useQuery(api.admin.overview);
  const setTrusted = useMutation(api.admin.setTrusted);
  const remove = useMutation(api.tools.remove);
  const tools = useQuery(api.tools.list, {});
  const [message, setMessage] = useState("");

  if (!overview || !tools) return <p>Loading admin tools…</p>;

  return (
    <section>
      {message ? <p className="error">{message}</p> : null}
      <h2>Neighbors</h2>
      <div className="grid">
        {overview.lenders.map((lender) => (
          <article className="card" key={lender.id}>
            <p className="meta">{lender.role} · {lender.id.slice(-6)}</p>
            <button
              type="button"
              onClick={() => run(() => setTrusted({ userId: lender.id, trusted: !lender.trustedLender }), setMessage)}
            >
              {lender.trustedLender ? "Remove trusted lender" : "Mark trusted lender"}
            </button>
          </article>
        ))}
      </div>
      <h2>Listings</h2>
      <div className="grid">
        {tools.tools.map((tool) => (
          <article className="card" key={tool.id}>
            <h2>{tool.name}</h2>
            <p className="meta">{tool.category}</p>
            <button className="quiet" type="button" onClick={() => run(() => remove({ toolId: tool.id }), setMessage)}>
              Remove listing
            </button>
          </article>
        ))}
      </div>
      <h2>Loans</h2>
      <LoanList loans={overview.loans} empty="No loans yet." actions={() => null} />
    </section>
  );
}

function LoanList({
  loans,
  empty,
  actions,
}: {
  loans: Array<{
    id: Id<"loans">;
    toolName: string;
    toolCategory: string;
    startDate: string;
    endDate: string;
    status: string;
    events?: Array<{ type: string; message: string; createdAt: number }>;
  }> | undefined;
  empty: string;
  actions: (loan: NonNullable<typeof loans>[number], setMessage: (value: string) => void) => ReactNode;
}) {
  const [message, setMessage] = useState("");
  if (!loans) return <p>Loading requests…</p>;
  if (loans.length === 0) return <p>{empty}</p>;
  return (
    <section className="grid">
      {message ? <p className="error">{message}</p> : null}
      {loans.map((loan) => (
        <article className="card" key={loan.id}>
          <h2>{loan.toolName}</h2>
          <p className="meta">{loan.toolCategory} · {loan.status}</p>
          <p>{loan.startDate} to {loan.endDate}</p>
          {loan.events && loan.events.length > 0 ? (
            <ul className="events">
              {loan.events.map((event) => (
                <li key={`${event.createdAt}-${event.type}`}>{describeEvent(event)}</li>
              ))}
            </ul>
          ) : null}
          {actions(loan, setMessage)}
        </article>
      ))}
    </section>
  );
}

function ToolFields({
  categories,
  conditions,
  name = "",
  category = "garden",
  condition = "good",
  description = "",
}: {
  categories: readonly string[];
  conditions: readonly string[];
  name?: string;
  category?: string;
  condition?: string;
  description?: string;
}) {
  return (
    <>
      <label>
        Name
        <input name="name" defaultValue={name} required maxLength={80} />
      </label>
      <label>
        Category
        <select name="category" defaultValue={category}>
          {categories.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>
      <label>
        Condition
        <select name="condition" defaultValue={condition}>
          {conditions.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>
      <label>
        Description
        <textarea name="description" defaultValue={description} required maxLength={400} rows={3} />
      </label>
    </>
  );
}

function readTool(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    name: String(data.get("name") ?? ""),
    category: String(data.get("category") ?? "other") as "power tools" | "garden" | "kitchen" | "camping" | "other",
    condition: String(data.get("condition") ?? "good") as "excellent" | "good" | "fair",
    description: String(data.get("description") ?? ""),
  };
}

function describeEvent(event: { type: string; message: string; createdAt: number }) {
  const days = Math.floor((Date.now() - event.createdAt) / 86_400_000);
  const when = days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  if (event.type === "reminder") return `Reminder sent ${when}`;
  return `${event.message} (${when})`;
}

async function submit(
  event: FormEvent<HTMLFormElement>,
  action: () => Promise<void>,
  setMessage: (value: string) => void,
) {
  event.preventDefault();
  setMessage("");
  try {
    await action();
  } catch (error) {
    setMessage(errorText(error));
  }
}

function run(action: () => Promise<unknown>, setMessage: (value: string) => void) {
  setMessage("");
  void action().catch((error: unknown) => setMessage(errorText(error)));
}

function errorText(error: unknown) {
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "message" in data && typeof data.message === "string") {
      return data.message;
    }
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
