import { redirect } from "next/navigation";

export default function AuthForgotPasswordRedirectPage() {
  redirect("/forgot-password");
}
