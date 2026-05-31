import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · Spectro Web" };

export default function LoginPage() {
  return (
    <AuthShell title="Sign in to Spectro">
      <LoginForm />
    </AuthShell>
  );
}
