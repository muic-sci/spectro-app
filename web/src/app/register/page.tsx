import { AuthShell } from "@/components/auth/auth-shell";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Create account · Spectro Web" };

export default function RegisterPage() {
  return (
    <AuthShell title="Create your Spectro account">
      <RegisterForm />
    </AuthShell>
  );
}
