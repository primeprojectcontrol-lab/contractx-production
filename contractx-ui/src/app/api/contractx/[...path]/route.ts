import type { NextRequest } from "next/server";

// Route handlers already execute on the server. Keep this route on the Node.js
// runtime so localhost/FastAPI proxying uses Node's fetch implementation.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Allow long-running forensic calculations more time in deployments that honour
// Next.js route maxDuration. Local development is normally not constrained by it.
export const maxDuration = 300;

const BACKEND =
  process.env.CONTRACTX_BACKEND_URL?.trim() ||
  "http://127.0.0.1:8000";

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

function backendBaseUrl(): string {
  const raw = BACKEND.replace(/\/+$/, "");

  try {
    return new URL(raw).toString().replace(/\/+$/, "");
  } catch {
    throw new Error(
      `Invalid CONTRACTX_BACKEND_URL: ${JSON.stringify(BACKEND)}`
    );
  }
}

function backendErrorDetail(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Unknown backend connection error";
  }

  const parts = [error.message];

  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message) {
    parts.push(`cause: ${cause.message}`);
  } else if (cause && typeof cause === "object") {
    try {
      const causeRecord = cause as Record<string, unknown>;
      const code =
        typeof causeRecord.code === "string" ? causeRecord.code : "";
      const message =
        typeof causeRecord.message === "string" ? causeRecord.message : "";

      if (code || message) {
        parts.push(
          `cause: ${[code, message].filter(Boolean).join(" - ")}`
        );
      }
    } catch {
      // Preserve the primary error only.
    }
  }

  return parts.join(" | ");
}

async function proxy(
  request: NextRequest,
  context: RouteContext
): Promise<Response> {
  let target: URL;

  try {
    const { path } = await context.params;

    const backendPath = Array.isArray(path)
      ? path.map((part) => encodeURIComponent(part)).join("/")
      : "";

    const base = backendBaseUrl();
    target = new URL(`${base}/${backendPath}`);

    request.nextUrl.searchParams.forEach((value, key) => {
      target.searchParams.append(key, value);
    });
  } catch (error) {
    return Response.json(
      {
        detail: `ContractX frontend proxy configuration error. ${backendErrorDetail(
          error
        )}`,
      },
      { status: 500 }
    );
  }

  const headers = new Headers();

  for (const name of [
    "content-type",
    "authorization",
    "accept",
    "x-request-id",
  ]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const method = request.method.toUpperCase();

  let body: ArrayBuffer | undefined;
  if (!["GET", "HEAD"].includes(method)) {
    body = await request.arrayBuffer();
  }

  try {
    const backendResponse = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
      redirect: "manual",
    });

    const responseHeaders = new Headers();

    for (const name of [
      "content-type",
      "content-disposition",
      "cache-control",
    ]) {
      const value = backendResponse.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    const detail = backendErrorDetail(error);

    console.error("[ContractX proxy] FastAPI request failed", {
      method,
      target: target.toString(),
      detail,
    });

    return Response.json(
      {
        detail:
          `ContractX frontend proxy could not complete the FastAPI request ` +
          `to ${target.toString()}. ${detail}`,
      },
      { status: 502 }
    );
  }
}

export async function GET(
  request: NextRequest,
  context: RouteContext
): Promise<Response> {
  return proxy(request, context);
}

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<Response> {
  return proxy(request, context);
}

export async function PUT(
  request: NextRequest,
  context: RouteContext
): Promise<Response> {
  return proxy(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
): Promise<Response> {
  return proxy(request, context);
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext
): Promise<Response> {
  return proxy(request, context);
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    },
  });
}
