import { NextResponse } from 'next/server'

export async function GET() {
  // This is a dummy session. In a real application, you would check if the user is actually logged in.
  return NextResponse.json({
    user: {
      id: '1',
      name: 'John Doe',
      role: 'admin'
    }
  })
}

