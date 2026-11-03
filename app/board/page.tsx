import { UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { AuthSync } from "@/components/AuthSync";
import { Board } from "@/components/Board";

export default function BoardPage() {
  return (
    <main>
      <AuthSync />
      <header className="site">
        <div>
          <h1>LendLoop</h1>
          <p className="tagline">Borrow what you need. Lend what you don&apos;t.</p>
        </div>
        <div className="row">
          <Link href="/">Public board</Link>
          <UserButton />
        </div>
      </header>
      <Board />
    </main>
  );
}
