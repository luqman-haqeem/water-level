import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // This is a dummy logout. In a real application, you would invalidate the session.
  return NextResponse.json({ success: true });
}
