import { redirect } from "next/navigation";
import { LoginForm } from "@/components/AuthForms";
import { getCurrentUser } from "@/lib/server/auth";

export const metadata = { title: "Sign in · ExamMentor AI" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <h1 className="h1 mb-1">Sign in</h1>
        <p className="muted mb-6">Continue your personalised preparation.</p>
        <LoginForm />
      </div>
    </div>
  );
}
