import { VERTEX_SHADER, FRAGMENT_SHADER } from "./shaders";
import { LightingSettings } from "../types";

export class WebGLRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture | null = null;
  private positionBuffer: WebGLBuffer | null = null;
  private texCoordBuffer: WebGLBuffer | null = null;

  private analysisFramebuffer: WebGLFramebuffer | null = null;
  private analysisTexture: WebGLTexture | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { 
      preserveDrawingBuffer: true,
      antialias: true,
      alpha: true
    });
    if (!gl) throw new Error("WebGL not supported");
    this.gl = gl;
    this.program = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
    this.initBuffers();
    this.initAnalysisFBO();
  }

  private initAnalysisFBO() {
    const size = 128;
    this.analysisFramebuffer = this.gl.createFramebuffer();
    this.analysisTexture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.analysisTexture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, size, size, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.analysisFramebuffer);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, this.analysisTexture, 0);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  private createShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type)!;
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error("Shader compile error: " + info);
    }
    return shader;
  }

  private createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const vs = this.createShader(this.gl.VERTEX_SHADER, vsSource);
    const fs = this.createShader(this.gl.FRAGMENT_SHADER, fsSource);
    const program = this.gl.createProgram()!;
    this.gl.attachShader(program, vs);
    this.gl.attachShader(program, fs);
    this.gl.linkProgram(program);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      throw new Error("Program link error: " + this.gl.getProgramInfoLog(program));
    }
    return program;
  }

  private initBuffers() {
    this.positionBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
      -1, -1, 1, -1, -1, 1,
      -1, 1, 1, -1, 1, 1,
    ]), this.gl.STATIC_DRAW);

    this.texCoordBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
      0, 1, 1, 1, 0, 0,
      0, 0, 1, 1, 1, 0,
    ]), this.gl.STATIC_DRAW);
  }

  private currentImage: HTMLImageElement | HTMLCanvasElement | null = null;

  public setImage(img: HTMLImageElement | HTMLCanvasElement) {
    if (this.currentImage === img) return;
    this.currentImage = img;

    if (this.texture) this.gl.deleteTexture(this.texture);
    this.texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    
    // Set parameters
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    
    try {
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, img);
    } catch (e) {
      console.error("WebGL texImage2D failed:", e);
      throw e;
    }
  }

  public render(settings: LightingSettings, width: number, height: number) {
    if (!this.texture || width <= 0 || height <= 0) return;
    
    this.gl.viewport(0, 0, width, height);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.gl.useProgram(this.program);

    // Bind texture to unit 0
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
    const imageLoc = this.gl.getUniformLocation(this.program, "u_image");
    this.gl.uniform1i(imageLoc, 0);

    // Attributes
    const posLoc = this.gl.getAttribLocation(this.program, "a_position");
    this.gl.enableVertexAttribArray(posLoc);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
    this.gl.vertexAttribPointer(posLoc, 2, this.gl.FLOAT, false, 0, 0);

    // Dynamic texture coordinates (Cropping & Rotation)
    const left = settings.cropLeft / 100;
    const right = 1.0 - settings.cropRight / 100;
    const top = settings.cropTop / 100;
    const bottom = 1.0 - settings.cropBottom / 100;

    let x1 = settings.flipX ? right : left;
    let x2 = settings.flipX ? left : right;
    let y1 = settings.flipY ? bottom : top;
    let y2 = settings.flipY ? top : bottom;

    const rot = (settings.rotation % 360 + 360) % 360;
    let coords = [x1, y2, x2, y2, x1, y1, x1, y1, x2, y2, x2, y1];

    if (rot === 90) coords = [x1, y1, x1, y2, x2, y1, x2, y1, x1, y2, x2, y2];
    else if (rot === 180) coords = [x2, y1, x1, y1, x2, y2, x2, y2, x1, y1, x1, y2];
    else if (rot === 270) coords = [x2, y2, x2, y1, x1, y2, x1, y2, x2, y1, x1, y1];

    const texLoc = this.gl.getAttribLocation(this.program, "a_texCoord");
    this.gl.enableVertexAttribArray(texLoc);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.texCoordBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(coords), this.gl.DYNAMIC_DRAW);
    this.gl.vertexAttribPointer(texLoc, 2, this.gl.FLOAT, false, 0, 0);

    // -- UNIFORMS (Professional Mapping) --
    const s = settings;
    this.setUniform("u_exposure", s.exposure ?? 0);
    this.setUniform("u_contrast", (s.contrast ?? 100) / 100);
    this.setUniform("u_temp", (s.warmth ?? 0) / 100);
    this.setUniform("u_tint", (s.tint ?? 0) / 100);
    this.setUniform("u_highlights", ((s.highlights ?? 100) - 100) / 100);
    this.setUniform("u_shadows", ((s.shadows ?? 100) - 100) / 100);
    this.setUniform("u_whites", ((s.whites ?? 100) - 100) / 100);
    this.setUniform("u_blacks", ((s.blacks ?? 100) - 100) / 100);
    this.setUniform("u_saturation", (s.saturation ?? 100) / 100);
    this.setUniform("u_vibrance", ((s.vibrance ?? 100) - 100) / 100);
    this.setUniform("u_clarity", (s.clarity ?? 0) / 100);
    this.setUniform("u_texture", (s.texture ?? 0) / 100);
    this.setUniform("u_dehaze", (s.dehaze ?? 0) / 100);
    this.setUniform("u_vignette", (s.vignette ?? 0) / 100);
    this.setUniform("u_grain", (s.grain ?? 0) / 100);
    this.setUniform("u_sepia", (s.sepia ?? 0) / 100);
    this.setUniform("u_sharpening", (s.sharpening ?? 0) / 100);
    this.setUniform("u_time", performance.now() / 1000);
    this.setUniformVec2("u_resolution", [width, height]);

    // Color Grading (Split Toning)
    this.setUniformVec3("u_shadowTint", this.hexToRgb(s.shadowTint));
    this.setUniformVec3("u_midtoneTint", this.hexToRgb(s.midtoneTint));
    this.setUniformVec3("u_highlightTint", this.hexToRgb(s.highlightTint));
    this.setUniform("u_balance", (s.balance ?? 0) / 100);

    this.gl.drawArrays(this.gl.TRIANGLES, 0, 6);
  }

  private hexToRgb(hex: string): [number, number, number] {
    if (!hex || typeof hex !== 'string' || hex === "transparent") return [0, 0, 0];
    
    if (hex.startsWith("hsl")) {
      // Parse hsla(h, s%, l%, a)
      const parts = hex.match(/\d+(\.\d+)?/g);
      if (!parts || parts.length < 3) return [0, 0, 0];
      const h = parseFloat(parts[0]) / 360;
      const s = parseFloat(parts[1]) / 100;
      const l = parseFloat(parts[2]) / 100;
      
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };

      if (s === 0) return [l, l, l];
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      return [
        hue2rgb(p, q, h + 1/3),
        hue2rgb(p, q, h),
        hue2rgb(p, q, h - 1/3)
      ];
    }

    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [isNaN(r) ? 0 : r, isNaN(g) ? 0 : g, isNaN(b) ? 0 : b];
  }

  private setUniform(name: string, value: number) {
    const loc = this.gl.getUniformLocation(this.program, name);
    this.gl.uniform1f(loc, value);
  }

  private setUniformVec2(name: string, value: [number, number]) {
    const loc = this.gl.getUniformLocation(this.program, name);
    this.gl.uniform2fv(loc, value);
  }

  private setUniformVec3(name: string, value: [number, number, number]) {
    const loc = this.gl.getUniformLocation(this.program, name);
    this.gl.uniform3fv(loc, value);
  }

  public getPixels(width: number, height: number): Uint8Array {
    const pixels = new Uint8Array(width * height * 4);
    this.gl.readPixels(0, 0, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
    return pixels;
  }

  /**
   * Captures a 128x128 version of the image with the given settings.
   * Useful for histograms without blocking the UI thread.
   */
  public getAnalysisPixels(settings: LightingSettings): Uint8Array {
    if (!this.analysisFramebuffer) return new Uint8Array(128 * 128 * 4);
    
    // Bind the analysis framebuffer
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.analysisFramebuffer);
    
    // Render to the small FBO (128x128)
    this.render(settings, 128, 128);
    
    // Read pixels from the FBO
    const pixels = new Uint8Array(128 * 128 * 4);
    this.gl.readPixels(0, 0, 128, 128, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
    
    // Unbind the framebuffer
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    
    return pixels;
  }

  public destroy() {
    if (this.texture) this.gl.deleteTexture(this.texture);
    if (this.analysisTexture) this.gl.deleteTexture(this.analysisTexture);
    if (this.analysisFramebuffer) this.gl.deleteFramebuffer(this.analysisFramebuffer);
    if (this.positionBuffer) this.gl.deleteBuffer(this.positionBuffer);
    if (this.texCoordBuffer) this.gl.deleteBuffer(this.texCoordBuffer);
    this.gl.deleteProgram(this.program);
  }
}
