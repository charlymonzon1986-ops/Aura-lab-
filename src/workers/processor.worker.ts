/**
 * Aura Lab - High Performance Image Processor Worker
 * Handles heavy tasks like thumbnail generation, EXIF parsing, and large file transformations.
 */

self.onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'GENERATE_PROXY':
      const { bitmap, maxDim } = payload;
      const proxy = await generateProxy(bitmap, maxDim);
      self.postMessage({ type: 'PROXY_READY', payload: proxy }, [proxy]);
      break;
    
    default:
      console.warn('Unknown worker task:', type);
  }
};

async function generateProxy(bitmap: ImageBitmap, maxDim: number): Promise<ImageBitmap> {
  const { width, height } = bitmap;
  let newWidth = width;
  let newHeight = height;

  if (width > height) {
    if (width > maxDim) {
      newHeight = (height * maxDim) / width;
      newWidth = maxDim;
    }
  } else {
    if (height > maxDim) {
      newWidth = (width * maxDim) / height;
      newHeight = maxDim;
    }
  }

  const canvas = new OffscreenCanvas(newWidth, newHeight);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(bitmap, 0, 0, newWidth, newHeight);
  }
  
  return canvas.transferToImageBitmap();
}
