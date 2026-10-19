import Link from "next/link";
import { requirePageUser } from "@/lib/server/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser("ADMIN");
  const links = [["/admin", "Overview"], ["/admin/questions", "Review queue"], ["/admin/import", "Import"], ["/admin/syllabus", "Syllabus versions"], ["/admin/quality", "Data quality"], ["/admin/papers", "Paper analysis"]];
  return (
    <div className="space-y-6">
      <nav aria-label="Admin" className="flex flex-wrap gap-1 rounded-lg bg-slate-900 p-1 text-sm">
        {links.map(([href, label]) => <Link key={href} href={href} className="rounded-md px-3 py-1.5 text-slate-200 hover:bg-slate-700 hover:text-white">{label}</Link>)}
      </nav>
      {children}
    </div>
  );
}
