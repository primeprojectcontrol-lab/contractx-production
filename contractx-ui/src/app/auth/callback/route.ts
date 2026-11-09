import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const oauthError = searchParams.get("error_description") || searchParams.get("error");

  // Always use the request origin, avoiding redirects to an unrelated domain.
  const loginUrl = new URL("/login", request.url);

  if (!code) {
    loginUrl.searchParams.set("auth_error", oauthError || "Google authentication was cancelled or incomplete.");
    return NextResponse.redirect(loginUrl);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      loginUrl.searchParams.set("auth_error", "Could not complete Google authentication. Please retry.");
      return NextResponse.redirect(loginUrl);
    }

    // Existing /login logic handles project-aware redirects after session creation.
    return NextResponse.redirect(loginUrl);
  } catch {
    loginUrl.searchParams.set("auth_error", "Could not complete Google authentication. Please retry.");
    return NextResponse.redirect(loginUrl);
  }
}
