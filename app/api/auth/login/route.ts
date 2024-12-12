import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = await request.json();

  // This is a dummy login. In a real application, you would validate the credentials.
  if (true) {
    return NextResponse.json({
      user: {
        id: "1",
        name: "John Doe",
        role: "admin",
      },
    });
  } else {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
}
