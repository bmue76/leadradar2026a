import AuthShell from "../_components/AuthShell";
import RegisterForm from "./ui/RegisterForm";

export default function Page() {
  return (
    <AuthShell
      title="Registrierung"
      subtitle="Erstelle deinen Mandanten (Tenant) und bestätige danach deine E-Mail."
    >
      <RegisterForm />
    </AuthShell>
  );
}
