import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/AuthForms";
import { getCurrentUser } from "@/lib/server/auth";

export const metadata = { title: "Create account · ExamMentor AI" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <h1 className="h1 mb-1">Create your account</h1>
        <p className="muted mb-6">Your learning profile is private to you. Nothing is shared with other students.</p>
        <RegisterForm />
      </div>
    </div>
  );
}
