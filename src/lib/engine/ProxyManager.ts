/**
 * Aura Lab - Professional Proxy Manager
 * Handles low-resolution previews for real-time editing while preserving original quality.
 */

export class ProxyManager {
  private proxies: Map<string, ImageBitmap> = new Map();
  private maxProxyDimension: number = 2048;

  /**
   * Generates or retrieves a low-resolution proxy for a given image URL/Blob.
   */
  async getProxy(url: string | Blob): Promise<ImageBitmap> {
    const key = typeof url === 'string' ? url : (url as any).name || 'blob';
    
    if (this.proxies.has(key)) {
      return this.proxies.get(key)!;
    }

    const source = typeof url === 'string' ? await this.fetchImage(url) : await createImageBitmap(url);
    const proxy = await this.generateProxyBitmap(source);
    
    this.proxies.set(key, proxy);
    return proxy;
  }

  private async fetchImage(url: string): Promise<ImageBitmap> {
    const response = await fetch(url);
    const blob = await response.blob();
    return createImageBitmap(blob);
  }

  private async generateProxyBitmap(source: ImageBitmap): Promise<ImageBitmap> {
    const { width, height } = source;
    let newWidth = width;
    let newHeight = height;

    if (width > height) {
      if (width > this.maxProxyDimension) {
        newHeight = (height * this.maxProxyDimension) / width;
        newWidth = this.maxProxyDimension;
      }
    } else {
      if (height > this.maxProxyDimension) {
        newWidth = (width * this.maxProxyDimension) / height;
        newHeight = this.maxProxyDimension;
      }
    }

    const canvas = new OffscreenCanvas(newWidth, newHeight);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(source, 0, 0, newWidth, newHeight);
    }
    
    return canvas.transferToImageBitmap();
  }

  /**
   * Clean up proxies to prevent memory leaks.
   */
  clear() {
    this.proxies.forEach(p => p.close());
    this.proxies.clear();
  }
}

export const proxyManager = new ProxyManager();
