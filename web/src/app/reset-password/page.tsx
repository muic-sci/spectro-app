import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { resolvePasswordResetToken } from "@/lib/auth-tokens";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Reset password · Spectro Web" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = token ? Boolean(await resolvePasswordResetToken(token)) : false;

  return (
    <AuthShell title="Set a new password">
      {valid && token ? (
        <ResetForm token={token} />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-t2">
            This reset link is invalid or has expired. Reset links are valid for 1 hour and can be
            used once.
          </p>
          <Link href="/forgot-password" className="text-sm text-t2 hover:text-t1">
            → Request a new reset link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
