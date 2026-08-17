import { NextResponse } from "next/server";
import { getClients, saveClient, deleteClient } from "@/lib/cms/store";

export async function GET() {
  const clients = getClients();
  return NextResponse.json({ clients });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.name || !body.email) {
      return NextResponse.json(
        { error: "Client name and email are required" },
        { status: 400 }
      );
    }
    const client = saveClient(body);
    return NextResponse.json({ success: true, client });
  } catch (err) {
    console.error("Save client error:", err);
    return NextResponse.json({ error: "Failed to save client" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Client ID is required" }, { status: 400 });
    }
    const success = deleteClient(id);
    return NextResponse.json({ success });
  } catch (err) {
    console.error("Delete client error:", err);
    return NextResponse.json({ error: "Failed to delete client" }, { status: 500 });
  }
}
