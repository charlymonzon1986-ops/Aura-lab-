// src/lib/rawProcessor.ts

export class RAWProcessingError extends Error {
  constructor(public code: 'UNSUPPORTED_FORMAT' | 'CORRUPT_FILE' | 'WASM_LOAD_FAILED', message: string) {
    super(message);
    this.name = 'RAWProcessingError';
  }
}

export interface RAWProcessResult {
  imageData: ImageData;
  width: number;
  height: number;
  metadata: {
    camera: string;
    lens?: string;
    iso?: number;
    aperture?: number;
    shutterSpeed?: string;
    focalLength?: number;
    capturedAt?: string;
  };
}

const RAW_EXTENSIONS = [
  'cr2', 'cr3',   // Canon
  'arw',          // Sony
  'nef', 'nrw',   // Nikon
  'dng',          // Adobe
  'raf',          // Fujifilm
  'rw2'           // Panasonic
];

export function getRAWExtensions(): string[] {
  return RAW_EXTENSIONS;
}

export function isRAWFile(file: File | string): boolean {
  const name = typeof file === 'string' ? file : file.name;
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return RAW_EXTENSIONS.includes(ext);
}

export async function processRAWFile(file: File): Promise<RAWProcessResult> {
  return new Promise((resolve, reject) => {
    // Create worker lazily
    // Note: Vite uses new Worker(new URL(...), { type: 'module' })
    const worker = new Worker(
      new URL('../workers/rawWorker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent<any>) => {
      const response = e.data;
      if (response.type === 'SUCCESS') {
        const { pixelData, width, height, metadata } = response.payload;
        const imageData = new ImageData(pixelData, width, height);
        
        resolve({
          imageData,
          width,
          height,
          metadata
        });
        worker.terminate();
      } else {
        const { code, message } = response.error;
        reject(new RAWProcessingError(code, message));
        worker.terminate();
      }
    };

    worker.onerror = (err) => {
      reject(new RAWProcessingError('WASM_LOAD_FAILED', `Worker error: ${err.message}`));
      worker.terminate();
    };

    file.arrayBuffer()
      .then(buffer => {
        worker.postMessage(buffer, [buffer]);
      })
      .catch(err => {
        reject(new RAWProcessingError('CORRUPT_FILE', `Failed to read file: ${err.message}`));
      });
  });
}

/**
 * Generates a 300x300 thumbnail as base64 JPEG
 */
export async function generateRAWThumbnail(imageData: ImageData): Promise<string> {
  const canvas = new OffscreenCanvas(300, 300);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get OffscreenCanvas context');

  // Create a temporary canvas for source
  const sourceCanvas = new OffscreenCanvas(imageData.width, imageData.height);
  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) throw new Error('Failed to get source context');
  sourceCtx.putImageData(imageData, 0, 0);

  // Resize and draw
  ctx.drawImage(sourceCanvas, 0, 0, 300, 300);
  
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
