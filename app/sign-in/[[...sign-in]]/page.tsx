import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main>
      <SignIn fallbackRedirectUrl="/board" signUpUrl="/sign-up" />
    </main>
  );
}
