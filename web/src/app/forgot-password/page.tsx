import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Forgot password · Spectro Web" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Reset your password">
      <ForgotForm />
    </AuthShell>
  );
}
