import { NextResponse } from "next/server";
import { resolvePublicUrl } from "@/lib/resolve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const value = typeof body?.url === "string" ? body.url.trim() : "";

    if (!value || value.length > 4096) {
      return NextResponse.json({ ok: false, error: "Masukkan URL yang valid untuk diproses." }, { status: 400 });
    }

    const result = await resolvePublicUrl(value);
    return NextResponse.json({ ok: true, result }, {
      headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal memproses link.";
    return NextResponse.json({ ok: false, error: message }, { status: 422 });
  }
}
