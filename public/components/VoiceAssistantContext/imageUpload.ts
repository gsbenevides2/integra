/** Longest side of uploaded photos; plenty for the model, small to upload. */
export const MAX_UPLOAD_DIMENSION = 1600;
export const UPLOAD_JPEG_QUALITY = 0.85;

/** An image as the server returns it: stored key plus a presigned URL. */
export interface AssistantImage {
  key: string;
  url: string;
  mediaType: string;
  source: "upload" | "generated" | "camera";
  label?: string;
}

/**
 * Downscales a photo to MAX_UPLOAD_DIMENSION as JPEG. GIFs, images that are
 * already small, and browsers that cannot decode the file keep the original.
 */
export async function prepareImage(file: Blob): Promise<Blob> {
  if (file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1024 * 1024) return file;
    const canvas = new OffscreenCanvas(
      Math.round(bitmap.width * scale),
      Math.round(bitmap.height * scale),
    );
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await canvas.convertToBlob({ type: "image/jpeg", quality: UPLOAD_JPEG_QUALITY });
  } catch {
    return file;
  }
}

/** Uploads an image to the private bucket, ready to attach to a message. */
export async function uploadImage(file: Blob): Promise<AssistantImage> {
  const body = await prepareImage(file);
  const response = await fetch("/api/assistant/uploads", {
    method: "POST",
    headers: { "content-type": body.type },
    body,
  });
  if (response.status === 415) throw new Error("Formato de imagem não suportado");
  if (!response.ok) throw new Error("Falha ao enviar a imagem");
  return (await response.json()) as AssistantImage;
}
