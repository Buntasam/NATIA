// Les images sont stockées dans la note (et dans chacune de ses versions) :
// on les réduit avant insertion pour que la base ne gonfle pas.

const MAX_SIDE = 1600;
const MAX_UNTOUCHED_BYTES = 300 * 1024;
const QUALITY = 0.85;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = src;
  });
}

/** Image prête à insérer : au plus 1600 px de côté, en WebP si c'est plus léger. */
export async function imageToDataUrl(file: File): Promise<string> {
  const original = await readAsDataUrl(file);
  // GIF (animation) et SVG (vectoriel) : laissés tels quels.
  if (file.type === "image/gif" || file.type === "image/svg+xml") return original;

  try {
    const img = await loadImage(original);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && file.size <= MAX_UNTOUCHED_BYTES) return original;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // WebP garde la transparence et pèse bien moins qu'un PNG.
    const resized = canvas.toDataURL("image/webp", QUALITY);
    return resized.startsWith("data:image/webp") && resized.length < original.length ? resized : original;
  } catch {
    return original;
  }
}
