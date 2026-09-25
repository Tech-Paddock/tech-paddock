import { NextRequest, NextResponse } from "next/server";
import { identifyBag } from "@/lib/anthropic";
import { isImageType } from "@/lib/storage";

export const dynamic = "force-dynamic";

// The client downscales to 1568px on the long edge before uploading, which
// lands well under this. The cap is here because Vercel rejects bodies over
// ~4.5MB with an opaque error, and a raw iPhone HEIC would hit it.
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Upload the photo as multipart form data." }, { status: 400 });
  }

  const photo = form.get("photo");
  if (!(photo instanceof File)) {
    return NextResponse.json({ error: "Attach a photo of the bag." }, { status: 400 });
  }
  if (!isImageType(photo.type)) {
    return NextResponse.json(
      { error: `${photo.type || "That file"} isn't a supported image. Use JPEG, PNG, WebP or GIF.` },
      { status: 415 }
    );
  }
  if (photo.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That photo is ${(photo.size / 1024 / 1024).toFixed(1)}MB, over the ${MAX_BYTES / 1024 / 1024}MB limit.` },
      { status: 413 }
    );
  }

  try {
    const identity = await identifyBag({
      media_type: photo.type,
      data: Buffer.from(await photo.arrayBuffer()).toString("base64"),
    });
    return NextResponse.json({ identity });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Couldn't read that photo." },
      { status: 502 }
    );
  }
}
