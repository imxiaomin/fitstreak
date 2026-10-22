/** Photos stay on the device until the user explicitly starts recognition. */
export interface NutritionImage { imageData: string; preview: string }
const MAX_BYTES = 4 * 1024 * 1024;

/** Native image components need a local file; remove that file after viewing. */
export async function nutritionPhotoPreview(imageData: string): Promise<{ preview: string; release: () => void }> {
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(imageData)) throw new Error("IMAGE_READ_FAILED");
  // #ifdef H5
  return { preview: imageData, release: () => {} };
  // #endif
  // #ifdef MP-WEIXIN
  const parts = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(imageData)!;
  const fileSystem = (uni as any).getFileSystemManager();
  const path = (uni as any).env.USER_DATA_PATH + '/nutrition-view-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + (parts[1] === 'jpeg' ? 'jpg' : parts[1]);
  await new Promise((resolve, reject) => fileSystem.writeFile({ filePath: path, data: parts[2], encoding: 'base64', success: resolve, fail: reject }));
  return { preview: path, release: () => fileSystem.unlink({ filePath: path, fail: () => {} }) };
  // #endif
  throw new Error("IMAGE_UNSUPPORTED");
}

export async function chooseNutritionImage(source: "album" | "camera"): Promise<NutritionImage | null> {
  let result: any;
  try {
    result = await new Promise((resolve, reject) => uni.chooseImage({ count: 1, sizeType: ["compressed"], sourceType: [source], success: resolve, fail: reject }));
  } catch (error: any) {
    if (/cancel/i.test(error?.errMsg || "")) return null;
    throw new Error("IMAGE_SELECT_FAILED");
  }
  let path = result.tempFilePaths?.[0];
  if (!path) throw new Error("IMAGE_SELECT_FAILED");
  // #ifdef H5
  return await browserImage(path);
  // #endif
  // #ifdef MP-WEIXIN
  try {
    const info: any = await new Promise((resolve, reject) => uni.getImageInfo({ src: path, success: resolve, fail: reject }));
    const ratio = Math.min(1, 1600 / Math.max(info.width, info.height));
    const compressed: any = await new Promise((resolve, reject) => uni.compressImage({ src: path, quality: 75, compressedWidth: Math.round(info.width * ratio), compressedHeight: Math.round(info.height * ratio), success: resolve, fail: reject } as any));
    path = compressed.tempFilePath;
    const encoded = await new Promise<string>((resolve, reject) => (uni as any).getFileSystemManager().readFile({ filePath: path, encoding: "base64", success: (r: any) => resolve(r.data), fail: reject }));
    if (encoded.length * 0.75 > MAX_BYTES) throw new Error("IMAGE_TOO_LARGE");
    const mime = encoded.startsWith("/9j/") ? "jpeg" : encoded.startsWith("iVBOR") ? "png" : encoded.startsWith("UklGR") ? "webp" : null;
    if (!mime) throw new Error("IMAGE_UNSUPPORTED");
    return { imageData: "data:image/" + mime + ";base64," + encoded, preview: path };
  } catch (error: any) { throw new Error(error?.message === "IMAGE_TOO_LARGE" ? "IMAGE_TOO_LARGE" : "IMAGE_READ_FAILED"); }
  // #endif
  throw new Error("IMAGE_UNSUPPORTED");
}

// #ifdef H5
async function browserImage(path: string): Promise<NutritionImage> {
  try {
    // chooseImage creates a local blob URL; never fetch arbitrary network images.
    if (!/^(blob:|data:image\/)/i.test(path)) throw new Error("IMAGE_READ_FAILED");
    const blob = await (await fetch(path)).blob();
    if (!/^image\/(jpeg|png|webp)$/i.test(blob.type)) throw new Error("IMAGE_UNSUPPORTED");
    const localData = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = localData; });
    if (img.naturalWidth * img.naturalHeight > 60_000_000) throw new Error("IMAGE_TOO_LARGE");
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("IMAGE_READ_FAILED");
    context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(img, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL("image/jpeg", 0.82);
    if (data.length * 0.75 > MAX_BYTES) data = canvas.toDataURL("image/jpeg", 0.55);
    if (data.length * 0.75 > MAX_BYTES) throw new Error("IMAGE_TOO_LARGE");
    return { imageData: data, preview: data };
  } catch (error: any) { throw new Error(["IMAGE_TOO_LARGE", "IMAGE_UNSUPPORTED"].includes(error?.message) ? error.message : "IMAGE_READ_FAILED"); }
}
// #endif
