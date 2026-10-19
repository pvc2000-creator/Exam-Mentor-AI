import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/server/auth";
import { logoutAction } from "./actions/auth";

export const metadata: Metadata = {
  title: "ExamMentor AI",
  description: "An adaptive, personalised mentor for the Madhya Pradesh Police Constable examination.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const links = user
    ? [
        ["/dashboard", "Dashboard"],
        ["/plan", "My plan"],
        ["/mocks", "Mocks"],
        ["/practice", "Practice"],
        ["/syllabus", "Syllabus"],
        ["/review", "Review"],
        ...(user.role === "ADMIN" ? [["/admin", "Admin"]] : []),
      ]
    : [];
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href={user ? "/dashboard" : "/"} className="flex items-center gap-2 font-bold text-slate-900">
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-sm text-white">EM</span>
              ExamMentor AI
            </Link>
            <nav aria-label="Main" className="flex flex-1 flex-wrap gap-1 text-sm">
              {links.map(([href, label]) => (
                <Link key={href} href={href} className="rounded-md px-2.5 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900">
                  {label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-2 text-sm">
              {user ? (
                <>
                  <Link href="/account" className="text-slate-600 hover:text-slate-900">{user.name}</Link>
                  <form action={logoutAction}>
                    <button className="btn-secondary px-3 py-1.5" type="submit">Sign out</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn-secondary px-3 py-1.5">Sign in</Link>
                  <Link href="/register" className="btn-primary px-3 py-1.5">Create account</Link>
                </>
              )}
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto max-w-6xl px-4 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-slate-500">
          ExamMentor AI is an independent study tool, not affiliated with MPESB or MP Police. The current question bank is synthetic practice
          material and is labelled as such. Always confirm exam rules in the official rule book.
        </footer>
      </body>
    </html>
  );
}
