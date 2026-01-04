import AuthShell from "../_components/AuthShell";
import ResetPasswordForm from "./ui/ResetPasswordForm";

export default function Page({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams?.token || "";
  return (
    <AuthShell
      title="Passwort zurücksetzen"
      subtitle="Wähle ein neues Passwort."
      footer={<a href="/auth/login">Zum Login</a>}
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
