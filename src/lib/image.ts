import type { ParsedReceipt } from "../../server/receiptSchema";

// Phone photos are often 5–15 MB. Shrinking them keeps uploads fast and well
// under API limits while leaving receipt text easily readable.
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.85;

interface PreparedImage {
  data: string;
  mediaType: string;
}

async function prepareImage(file: File): Promise<PreparedImage> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    return { data: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" };
  } catch {
    // The browser can't decode it (e.g. HEIC outside Safari). Send it as-is if
    // it's a format the reader accepts and small enough.
    const accepted = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (accepted.includes(file.type) && file.size < 4_000_000) {
      const buffer = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buffer.length; i += 0x8000) {
        binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
      }
      return { data: btoa(binary), mediaType: file.type };
    }
    throw new Error("Couldn't open that photo. Try a JPEG or PNG, or take a new picture.");
  }
}

export async function scanReceipt(file: File): Promise<ParsedReceipt> {
  const image = await prepareImage(file);
  let response: Response;
  try {
    response = await fetch("/api/parse-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: image.data, mediaType: image.mediaType }),
    });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }

  type Body = { receipt?: ParsedReceipt; error?: string };
  let body: Body | null = null;
  try {
    body = (await response.json()) as Body;
  } catch {
    // Not JSON: usually a static host with no /api function behind it.
  }
  if (!response.ok || !body?.receipt) {
    throw new Error(
      body?.error ??
        "Receipt scanning isn't available on this server. You can still enter items by hand.",
    );
  }
  return body.receipt;
}
