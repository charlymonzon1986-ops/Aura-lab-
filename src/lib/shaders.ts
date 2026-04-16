export const VERTEX_SHADER = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0, 1);
    v_texCoord = a_texCoord;
  }
`;

export const FRAGMENT_SHADER = `
  precision highp float;
  uniform sampler2D u_image;
  varying vec2 v_texCoord;

  // Adjustments
  uniform float u_exposure;
  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_saturation;
  uniform float u_vibrance;
  uniform float u_warmth;
  uniform float u_tint;
  uniform float u_highlights;
  uniform float u_shadows;
  uniform float u_whites;
  uniform float u_blacks;
  uniform float u_vignette;
  uniform float u_grain;
  uniform float u_time;

  // New Adjustments
  uniform float u_clarity;
  uniform float u_texture;
  uniform float u_dehaze;
  uniform float u_sepia;
  uniform vec3 u_shadowTint;
  uniform vec3 u_midtoneTint;
  uniform vec3 u_highlightTint;
  uniform vec2 u_resolution;
  uniform float u_sharpening;
  uniform float u_blur;
  uniform float u_distortion;
  uniform float u_focus;
  uniform float u_lut;
  uniform float u_lutIntensity;
  uniform float u_noiseReduction;

  // Helper for saturation
  vec3 adjustSaturation(vec3 color, float saturation) {
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(luma), color, saturation);
  }

  // Helper for vibrance
  vec3 adjustVibrance(vec3 color, float vibrance) {
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float max_color = max(color.r, max(color.g, color.b));
    float avg_color = (color.r + color.g + color.b) / 3.0;
    float amt = (max_color - avg_color) * vibrance * 0.5;
    return color + (max_color - color) * amt;
  }

  // Random for grain
  float rand(vec2 co) {
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

  void main() {
    vec2 uv = v_texCoord;

    // 0. Lens Distortion (Barrel/Pincushion)
    if (u_distortion != 0.0) {
        vec2 center = vec2(0.5);
        vec2 delta = uv - center;
        float r2 = dot(delta, delta);
        float f = 1.0 + r2 * (u_distortion * 0.5);
        uv = center + delta * f;
        
        // Clamp to avoid edge artifacts
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            return;
        }
    }

    vec4 texColor = texture2D(u_image, uv);
    vec3 color = texColor.rgb;

    // 0.1 Blur (Simple 5-tap approximation)
    if (u_blur > 0.0) {
        vec2 off = (u_blur * 2.0) / u_resolution;
        vec3 b = color * 0.4;
        b += texture2D(u_image, uv + vec2(off.x, 0.0)).rgb * 0.15;
        b += texture2D(u_image, uv - vec2(off.x, 0.0)).rgb * 0.15;
        b += texture2D(u_image, uv + vec2(0.0, off.y)).rgb * 0.15;
        b += texture2D(u_image, uv - vec2(0.0, off.y)).rgb * 0.15;
        color = b;
    }

    // 1. Exposure (Logarithmic)
    color *= pow(2.0, u_exposure);

    // 2. Brightness
    color += u_brightness;

    // 3. Contrast
    color = (color - 0.5) * u_contrast + 0.5;

    // 4. Tonal Adjustments (Highlights/Shadows)
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float highlightMask = smoothstep(0.5, 1.0, luma);
    float shadowMask = 1.0 - smoothstep(0.0, 0.5, luma);
    
    color += highlightMask * u_highlights;
    color += shadowMask * u_shadows;
    
    // Whites/Blacks
    color += u_whites * step(0.8, luma);
    color += u_blacks * (1.0 - step(0.2, luma));

    // 5. Color Balance (Warmth/Tint)
    color.r += u_warmth * 0.15;
    color.b -= u_warmth * 0.15;
    color.g -= u_tint * 0.15;
    color.rb += u_tint * 0.07;

    // 6. Clarity & Texture (Simplified local contrast)
    if (u_clarity != 0.0 || u_texture != 0.0) {
        vec2 off = 1.0 / u_resolution;
        vec3 c_up = texture2D(u_image, v_texCoord + vec2(0.0, off.y)).rgb;
        vec3 c_down = texture2D(u_image, v_texCoord - vec2(0.0, off.y)).rgb;
        vec3 c_left = texture2D(u_image, v_texCoord - vec2(off.x, 0.0)).rgb;
        vec3 c_right = texture2D(u_image, v_texCoord + vec2(off.x, 0.0)).rgb;
        
        vec3 edge = color - (c_up + c_down + c_left + c_right) * 0.25;
        color += edge * (u_clarity * 0.5 + u_texture * 0.3);
    }

    // 6.1 Sharpening (Unsharp Mask)
    if (u_sharpening > 0.0) {
        vec2 off = 1.0 / u_resolution;
        vec3 c_up = texture2D(u_image, uv + vec2(0.0, off.y)).rgb;
        vec3 c_down = texture2D(u_image, uv - vec2(0.0, off.y)).rgb;
        vec3 c_left = texture2D(u_image, uv - vec2(off.x, 0.0)).rgb;
        vec3 c_right = texture2D(u_image, uv + vec2(off.x, 0.0)).rgb;
        
        vec3 blurred = (color + c_up + c_down + c_left + c_right) / 5.0;
        color += (color - blurred) * (u_sharpening * 2.0);
    }

    // 7. Dehaze
    if (u_dehaze != 0.0) {
        color = (color - 0.2 * u_dehaze) / (1.0 - 0.2 * u_dehaze);
        color *= (1.0 + u_dehaze * 0.2);
    }

    // 8. Saturation & Vibrance
    color = adjustSaturation(color, u_saturation);
    if (u_vibrance != 0.0) {
        color = adjustVibrance(color, u_vibrance);
    }

    // 9. Sepia
    if (u_sepia > 0.0) {
        vec3 sepiaColor;
        sepiaColor.r = dot(color, vec3(0.393, 0.769, 0.189));
        sepiaColor.g = dot(color, vec3(0.349, 0.686, 0.168));
        sepiaColor.b = dot(color, vec3(0.272, 0.534, 0.131));
        color = mix(color, sepiaColor, u_sepia);
    }

    // 10. Color Balance Tints (Shadows, Midtones, Highlights)
    luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    if (u_shadowTint != vec3(0.0)) {
        float sMask = 1.0 - smoothstep(0.0, 0.4, luma);
        color = mix(color, color + u_shadowTint * 0.3, sMask);
    }
    if (u_midtoneTint != vec3(0.0)) {
        float mMask = smoothstep(0.2, 0.5, luma) * (1.0 - smoothstep(0.5, 0.8, luma));
        color = mix(color, color + u_midtoneTint * 0.2, mMask);
    }
    if (u_highlightTint != vec3(0.0)) {
        float hMask = smoothstep(0.6, 1.0, luma);
        color = mix(color, color + u_highlightTint * 0.3, hMask);
    }

    // 10.1 Procedural LUTs
    if (u_lut > 0.5) {
        vec3 lutColor = color;
        if (u_lut < 1.5) { // Cinematic
            lutColor.r = pow(lutColor.r, 1.1);
            lutColor.b = pow(lutColor.b, 0.9);
            lutColor = mix(lutColor, vec3(dot(lutColor, vec3(0.3, 0.59, 0.11))), 0.1);
        } else if (u_lut < 2.5) { // Vintage
            lutColor = lutColor * vec3(1.1, 1.0, 0.8) + vec3(0.05, 0.02, 0.0);
            lutColor = adjustSaturation(lutColor, 0.8);
        } else if (u_lut < 3.5) { // Noir
            float gray = dot(lutColor, vec3(0.2126, 0.7152, 0.0722));
            lutColor = vec3(pow(gray, 1.2));
        } else if (u_lut < 4.5) { // Teal & Orange
            lutColor.r = smoothstep(0.0, 1.0, lutColor.r);
            lutColor.b = lutColor.b * 0.8 + 0.1;
            lutColor.g = lutColor.g * 0.9 + 0.05;
        } else if (u_lut < 5.5) { // Warm Gold
            lutColor *= vec3(1.2, 1.05, 0.8);
            lutColor += vec3(0.1, 0.05, 0.0);
        }
        color = mix(color, lutColor, u_lutIntensity);
    }

    // 10.2 Focus (Local Sharpening)
    if (u_focus > 0.0) {
        vec2 off = 1.0 / u_resolution;
        vec3 c_up = texture2D(u_image, uv + vec2(0.0, off.y)).rgb;
        vec3 c_down = texture2D(u_image, uv - vec2(0.0, off.y)).rgb;
        vec3 c_left = texture2D(u_image, uv - vec2(off.x, 0.0)).rgb;
        vec3 c_right = texture2D(u_image, uv + vec2(off.x, 0.0)).rgb;
        vec3 laplacian = color * 4.0 - (c_up + c_down + c_left + c_right);
        color += laplacian * (u_focus * 0.5);
    }

    // 10.3 Noise Reduction (Simple smart blur)
    if (u_noiseReduction > 0.0) {
        vec2 off = 1.5 / u_resolution;
        vec3 sum = color * 0.4;
        float count = 0.4;
        
        vec2 offsets[4];
        offsets[0] = vec2(off.x, 0.0);
        offsets[1] = vec2(-off.x, 0.0);
        offsets[2] = vec2(0.0, off.y);
        offsets[3] = vec2(0.0, -off.y);
        
        for(int i=0; i<4; i++) {
            vec3 c = texture2D(u_image, uv + offsets[i]).rgb;
            float diff = distance(color, c);
            float weight = smoothstep(0.2 * u_noiseReduction, 0.0, diff) * 0.15;
            sum += c * weight;
            count += weight;
        }
        color = sum / count;
    }

    // 11. Vignette
    float dist = distance(v_texCoord, vec2(0.5));
    float vignette = smoothstep(0.8, 0.2, dist * (1.0 + u_vignette));
    color *= mix(1.0, vignette, u_vignette);

    // 12. Grain
    if (u_grain > 0.0) {
        float noise = (rand(v_texCoord + u_time) - 0.5) * u_grain;
        color += noise;
    }

    // Clamp and output
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), texColor.a);
  }
`;
