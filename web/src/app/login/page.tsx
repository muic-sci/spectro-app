import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Spectro Web" };

export default async function LoginPage() {
  // Don't show the sign-in form to an already-authenticated user.
  const session = await auth();
  if (session?.user) redirect("/experiments");

  return (
    <AuthShell title="Sign in to Spectro">
      <LoginForm />
    </AuthShell>
  );
}
