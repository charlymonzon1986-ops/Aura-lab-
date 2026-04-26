// src/workers/rawWorker.ts
import libraw from 'libraw-wasm';

interface RawMetadata {
  camera: string;
  lens?: string;
  iso?: number;
  aperture?: number;
  shutterSpeed?: string;
  focalLength?: number;
  capturedAt?: string;
}

export interface WorkerResponse {
  type: 'SUCCESS' | 'ERROR';
  payload?: {
    pixelData: Uint8ClampedArray;
    width: number;
    height: number;
    metadata: RawMetadata;
  };
  error?: {
    code: string;
    message: string;
  };
}

const ctx: Worker = self as any;

ctx.onmessage = async (e: MessageEvent<ArrayBuffer>) => {
  try {
    const arrayBuffer = e.data;
    const uint8Array = new Uint8Array(arrayBuffer);

    // Initialize libraw
    const instance = await libraw();
    
    // Open buffer
    const errorCode = instance.open_buffer(uint8Array);
    if (errorCode !== 0) {
      ctx.postMessage({
        type: 'ERROR',
        error: { code: 'CORRUPT_FILE', message: `LibRaw failed to open buffer: ${errorCode}` }
      });
      return;
    }

    // Unpack data
    instance.unpack();
    
    // Process (debayering, etc.)
    // DCRAW_OPT_USER_QUAL: 3 (AHD) is good quality
    instance.dcraw_process();

    // Get the processed image
    const processedImage = instance.make_mem_image();
    const { width, height, colors, data } = processedImage;

    // Convert to RGBA for ImageData (LibRaw returns RGB)
    const pixelCount = width * height;
    const rgbaData = new Uint8ClampedArray(pixelCount * 4);
    
    for (let i = 0; i < pixelCount; i++) {
      rgbaData[i * 4] = data[i * 3];     // R
      rgbaData[i * 4 + 1] = data[i * 3 + 1]; // G
      rgbaData[i * 4 + 2] = data[i * 3 + 2]; // B
      rgbaData[i * 4 + 3] = 255;             // A
    }

    // Extract metadata (basic info)
    const metadata: RawMetadata = {
      camera: `${instance.get_make()} ${instance.get_model()}`,
      iso: instance.get_iso(),
      aperture: instance.get_aperture(),
      shutterSpeed: instance.get_shutter_speed(),
      focalLength: instance.get_focal_length(),
    };

    // Clean up
    instance.recycle();
    instance.free_mem_image(processedImage);

    ctx.postMessage({
      type: 'SUCCESS',
      payload: {
        pixelData: rgbaData,
        width,
        height,
        metadata
      }
    }, [rgbaData.buffer]); // Transferable

  } catch (error: any) {
    ctx.postMessage({
      type: 'ERROR',
      error: { code: 'UNSUPPORTED_FORMAT', message: error.message || 'Unknown RAW processing error' }
    });
  }
};
