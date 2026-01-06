import AuthShell from "../_components/AuthShell";
import ForgotPasswordForm from "./ui/ForgotPasswordForm";

export default function Page() {
  return (
    <AuthShell
      title="Passwort vergessen"
      subtitle="Du erhältst einen Link zum Zurücksetzen (in DEV wird er in der Konsole geloggt)."
      footer={<a href="/login">Zurück zum Login</a>}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
