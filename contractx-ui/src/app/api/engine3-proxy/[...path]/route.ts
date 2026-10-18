import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
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
  return BACKEND.replace(/\/+$/, "");
}

async function proxy(
  request: NextRequest,
  context: RouteContext
): Promise<Response> {
  try {
    const { path } = await context.params;

    const suffix = Array.isArray(path)
      ? path.map((part) => encodeURIComponent(part)).join("/")
      : "";

    const target = new URL(
      `${backendBaseUrl()}/api/v1/engine3/${suffix}`
    );

    request.nextUrl.searchParams.forEach((value, key) => {
      target.searchParams.append(key, value);
    });

    const headers = new Headers();

    for (const name of [
      "content-type",
      "authorization",
      "accept",
      "x-request-id",
    ]) {
      const value = request.headers.get(name);
      if (value) {
        headers.set(name, value);
      }
    }

    const method = request.method.toUpperCase();

    let body: ArrayBuffer | undefined;

    if (!["GET", "HEAD"].includes(method)) {
      body = await request.arrayBuffer();
    }

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
      if (value) {
        responseHeaders.set(name, value);
      }
    }

    return new Response(backendResponse.body, {
      status: backendResponse.status,
      statusText: backendResponse.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[Engine3 compatibility proxy] request failed", error);

    return Response.json(
      {
        detail: "Unable to complete Engine 3 proxy request.",
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
