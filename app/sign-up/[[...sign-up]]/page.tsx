import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main>
      <SignUp fallbackRedirectUrl="/board" signInUrl="/sign-in" />
    </main>
  );
}
