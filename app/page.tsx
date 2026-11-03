import Link from "next/link";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const catalog = await loadCatalog();

  return (
    <main>
      <header className="site">
        <div>
          <h1>LendLoop</h1>
          <p className="tagline">Borrow what you need. Lend what you don&apos;t.</p>
        </div>
        <div className="row">
          <Link className="button" href="/sign-in">
            Sign in to lend or borrow
          </Link>
          <Link className="button quiet" href="/board">
            Your board
          </Link>
        </div>
      </header>
      {catalog.tools === null ? (
        <p className="error">The board is not connected yet. Add NEXT_PUBLIC_CONVEX_URL and run Convex.</p>
      ) : catalog.tools.length === 0 ? (
        <p>Nothing is available to borrow right now.</p>
      ) : (
        <section className="grid">
          {catalog.tools.map((tool, index) => (
            <article className="card" key={`${tool.category}-${tool.name}-${index}`}>
              <h2>{tool.name}</h2>
              <p className="meta">{tool.category}</p>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

async function loadCatalog() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) return { tools: null };
  try {
    const client = new ConvexHttpClient(url);
    return { tools: await client.query(api.tools.catalog, {}) };
  } catch {
    return { tools: null };
  }
}
