import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/dashboard", "/plan", "/mocks", "/practice", "/syllabus", "/review", "/attempt", "/results", "/account", "/admin"];

/** Cheap cookie-presence gate for pages. Real authentication/authorisation happens on the server for every request. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) && !req.cookies.get("em_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next|favicon.ico).*)"] };
