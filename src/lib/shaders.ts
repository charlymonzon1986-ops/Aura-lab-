export const VERTEX_SHADER = `#version 300 es
  in vec2 a_position;
  in vec2 a_texCoord;
  out vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0, 1);
    v_texCoord = a_texCoord;
  }
`;

export const FRAGMENT_SHADER = `#version 300 es
  precision highp float;
  uniform sampler2D u_image;
  in vec2 v_texCoord;
  out vec4 outColor;

  // -- ADJUSTMENT UNIFORMS --
  uniform float u_exposure;    
  uniform float u_brightness;
  uniform float u_contrast;    
  uniform float u_highlights;  
  uniform float u_shadows;     
  uniform float u_whites;      
  uniform float u_blacks;      
  uniform float u_temp;        
  uniform float u_tint;        
  uniform float u_saturation;  
  uniform float u_vibrance;    
  uniform float u_clarity;     
  uniform float u_dehaze;      
  uniform float u_vignette;    
  uniform float u_grain;       
  uniform float u_time;        
  uniform float u_sharpening;
  uniform float u_focus;
  uniform float u_noiseReduction;
  uniform float u_blur;
  uniform float u_distortion;
  uniform vec2 u_resolution;
  
  // -- COLOR GRADING --
  uniform vec3 u_shadowTint;    // Split toning shadows
  uniform vec3 u_midtoneTint;   // Split toning midtones
  uniform vec3 u_highlightTint; // Split toning highlights
  uniform float u_balance;      // Split toning balance
  uniform float u_sepia;        // 0 to 1
  uniform float u_texture;      // Texture/Structure

  // -- HELPER FUNCTIONS --
  
  float getLuma(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  // Precise sRGB to Linear (IEC 61966-2-1)
  vec3 toLinear(vec3 srgb) {
    srgb = clamp(srgb, 0.0, 1.0);
    bvec3 cutoff = lessThanEqual(srgb, vec3(0.04045));
    vec3 higher = pow((srgb + 0.055) / 1.055, vec3(2.4));
    vec3 lower = srgb / 12.92;
    return mix(higher, lower, vec3(cutoff));
  }

  // Precise Linear to sRGB
  vec3 toSRGB(vec3 lin) {
    bvec3 cutoff = lessThanEqual(lin, vec3(0.0031308));
    vec3 higher = 1.055 * pow(max(lin, vec3(1e-6)), vec3(1.0/2.4)) - 0.055;
    vec3 lower = lin * 12.92;
    return mix(higher, lower, vec3(cutoff));
  }

  // Stable Tone Mapping (Lightroom-style soft shoulder)
  vec3 toneMap(vec3 x) {
    float white = 4.0; 
    return (x * (1.0 + x / (white * white))) / (1.0 + x);
  }

  // Stable Contrast (Proper slope around 0.5)
  // Contrast input is 0.0 to 2.0 (where 1.0 is neutral)
  vec3 applyContrast(vec3 color, float contrast) {
    if (abs(contrast - 1.0) < 0.001) return color;
    
    // Use a logarithmic slope for natural response
    float slope = contrast;
    if (contrast < 1.0) {
        // Handle reduction smoothly
        return (color - 0.5) * slope + 0.5;
    }
    
    // S-Curve for boost
    vec3 c = clamp(color, 0.0, 1.0);
    return mix(c, smoothstep(0.0, 1.0, c), (slope - 1.0) * 0.8);
  }

  // Better Saturation (Luminance preserving)
  vec3 applySaturation(vec3 color, float sat) {
    float luma = getLuma(color);
    return mix(vec3(luma), color, sat);
  }

  // HSL-aware Vibrance
  vec3 applyVibrance(vec3 color, float vib) {
    if (abs(vib - 1.0) < 0.01) return color;
    
    float mx = max(color.r, max(color.g, color.b));
    float mn = min(color.r, min(color.g, color.b));
    float sat = (mx - mn) / (mx + 1e-6);
    float luma = getLuma(color);
    
    // Scale boost based on current saturation (lower sat gets more boost)
    float sat_factor = 1.0 + (vib - 1.0) * (1.0 - sat);
    return mix(vec3(luma), color, sat_factor);
  }

  // Split Toning
  vec3 applySplitToning(vec3 color, vec3 sTint, vec3 mTint, vec3 hTint, float balance) {
    float luma = clamp(getLuma(color), 0.0, 1.0);
    
    float sMask = smoothstep(0.5 + balance * 0.3, 0.1 + balance * 0.3, luma);
    float hMask = smoothstep(0.4 + balance * 0.3, 0.9 + balance * 0.3, luma);
    float mMask = clamp(1.0 - sMask - hMask, 0.0, 1.0);
    
    // In Linear space tints should be additive to luminance or mixed
    color += sTint * sMask * 0.15;
    color += mTint * mMask * 0.08;
    color += hTint * hMask * 0.05;
    
    return color;
  }

  void main() {
    vec2 uv = v_texCoord;
    
    // -- 0. Distortion (Optics) --
    if (abs(u_distortion) > 0.001) {
        vec2 center = vec2(0.5);
        vec2 delta = uv - center;
        float r2 = dot(delta, delta);
        float k = u_distortion * 0.2; 
        uv = center + delta * (1.0 + k * r2);
    }
    
    // -- 1. Sampling & Initial Color --
    vec4 tex = texture(u_image, uv);
    vec3 color = tex.rgb;

    // -- 2. Linearize (Moved up to process everything in linear space) --
    color = toLinear(color);

    // -- 3. Noise Reduction & Blur (Independent) --
    if (u_blur > 0.01) {
        vec2 blurRadius = (u_blur * 8.0) / u_resolution;
        vec3 blurred = color * 0.2;
        blurred += toLinear(texture(u_image, uv + vec2(blurRadius.x, 0.0)).rgb) * 0.2;
        blurred += toLinear(texture(u_image, uv - vec2(blurRadius.x, 0.0)).rgb) * 0.2;
        blurred += toLinear(texture(u_image, uv + vec2(0.0, blurRadius.y)).rgb) * 0.2;
        blurred += toLinear(texture(u_image, uv - vec2(0.0, blurRadius.y)).rgb) * 0.2;
        color = mix(color, blurred, clamp(u_blur * 0.85, 0.0, 1.0)); 
    }
    if (u_noiseReduction > 0.01) {
        vec2 nrRadius = (u_noiseReduction * 3.0) / u_resolution;
        vec3 nrBlurred = color * 0.2;
        nrBlurred += toLinear(texture(u_image, uv + vec2(nrRadius.x, 0.0)).rgb) * 0.2;
        nrBlurred += toLinear(texture(u_image, uv - vec2(nrRadius.x, 0.0)).rgb) * 0.2;
        nrBlurred += toLinear(texture(u_image, uv + vec2(0.0, nrRadius.y)).rgb) * 0.2;
        nrBlurred += toLinear(texture(u_image, uv - vec2(0.0, nrRadius.y)).rgb) * 0.2;
        color = mix(color, nrBlurred, clamp(u_noiseReduction * 0.7, 0.0, 1.0)); 
    }

    // -- 4. Exposure & Brightness --
    color *= pow(2.0, clamp(u_exposure, -5.0, 5.0));
    color *= u_brightness;
    color = max(color, 0.0);

    // -- 5. White Balance (Orthogonal Temp/Tint) --
    float t = u_temp * 0.35; 
    float ti = u_tint * 0.2;
    
    // Calculate final factors to avoid compounding
    vec3 wbFactors = vec3(
        (1.0 + t) * (1.0 + ti * 0.2), 
        (1.0 - ti), 
        (1.0 - t) * (1.0 + ti * 0.2)
    );
    color *= wbFactors;
    
    color = max(color, 0.0);

    // -- 6. Basics: Highlights/Shadows/Whites/Blacks --
    float luma = getLuma(color);
    float hMask = smoothstep(0.3, 0.8, luma);
    float sMask = 1.0 - smoothstep(0.1, 0.6, luma);
    float wMask = smoothstep(0.6, 1.0, luma);
    float bMask = 1.0 - smoothstep(0.0, 0.4, luma);
    
    if (u_highlights < 0.0) {
        color = mix(color, color * (1.0 + u_highlights * 0.7), hMask);
    } else {
        color += u_highlights * 0.2 * hMask;
    }
    
    if (u_shadows > 0.0) {
        color = mix(color, 1.0 - (1.0 - color) * (1.0 - u_shadows * 0.5), sMask);
    } else {
        color *= (1.0 + u_shadows * 0.4 * sMask);
    }
    
    color += u_whites * 0.2 * wMask;
    color += u_blacks * 0.2 * bMask;
    color = max(color, 0.0);

    // -- 7. Real Clarity & Texture (Local Contrast) --
    // We use a multi-tap high-frequency extraction
    vec2 pixelSize = 1.5 / u_resolution;
    vec3 n = toLinear(texture(u_image, uv + vec2(0.0, pixelSize.y)).rgb);
    vec3 s = toLinear(texture(u_image, uv - vec2(0.0, pixelSize.y)).rgb);
    vec3 e = toLinear(texture(u_image, uv + vec2(pixelSize.x, 0.0)).rgb);
    vec3 w = toLinear(texture(u_image, uv - vec2(pixelSize.x, 0.0)).rgb);
    vec3 avg = (n + s + e + w) * 0.25;
    
    // Texture: Fine details (High pass)
    vec3 details = color - avg;
    color += details * u_texture * 0.5;
    
    // Clarity: Mid-tone local contrast
    // We use a larger radius radial kernel for clarity (20px approx, 8-tap)
    vec2 claritySize = 20.0 / u_resolution;
    vec3 c_avg = vec3(0.0);
    // 8-tap radial kernel to avoid orthogonal artifacts at large radii
    c_avg += toLinear(texture(u_image, uv + vec2(claritySize.x, 0.0)).rgb);
    c_avg += toLinear(texture(u_image, uv + vec2(-claritySize.x, 0.0)).rgb);
    c_avg += toLinear(texture(u_image, uv + vec2(0.0, claritySize.y)).rgb);
    c_avg += toLinear(texture(u_image, uv + vec2(0.0, -claritySize.y)).rgb);
    c_avg += toLinear(texture(u_image, uv + vec2(0.707 * claritySize.x, 0.707 * claritySize.y)).rgb);
    c_avg += toLinear(texture(u_image, uv + vec2(-0.707 * claritySize.x, 0.707 * claritySize.y)).rgb);
    c_avg += toLinear(texture(u_image, uv + vec2(0.707 * claritySize.x, -0.707 * claritySize.y)).rgb);
    c_avg += toLinear(texture(u_image, uv + vec2(-0.707 * claritySize.x, -0.707 * claritySize.y)).rgb);
    c_avg /= 8.0;
    
    float midtoneMask = smoothstep(0.1, 0.5, luma) * (1.0 - smoothstep(0.5, 0.9, luma));
    color += (color - c_avg) * u_clarity * midtoneMask * 0.8;
    
    color = max(color, 0.0);

    // -- 8. Contrast --
    color = applyContrast(color, u_contrast);
    color = max(color, 0.0);

    // -- 9. Saturation & Vibrance --
    color = applySaturation(color, u_saturation);
    color = applyVibrance(color, u_vibrance);
    color = max(color, 0.0);

    // -- 10. Split Toning --
    color = applySplitToning(color, toLinear(u_shadowTint), toLinear(u_midtoneTint), toLinear(u_highlightTint), u_balance);
    color = max(color, 0.0);

    // -- 11. Creative: Dehaze, Sharpness & Focus --
    if (abs(u_dehaze) > 0.01) {
        float d = u_dehaze * 0.15;
        color = (color - d) / (1.0 - abs(d) + 0.0001);
    }
    
    // Sharpness & Focus (Different Radii)
    vec2 focusSize = 3.5 / u_resolution;
    vec3 f_n = toLinear(texture(u_image, uv + vec2(0.0, focusSize.y)).rgb);
    vec3 f_s = toLinear(texture(u_image, uv - vec2(0.0, focusSize.y)).rgb);
    vec3 f_e = toLinear(texture(u_image, uv + vec2(focusSize.x, 0.0)).rgb);
    vec3 f_w = toLinear(texture(u_image, uv - vec2(focusSize.x, 0.0)).rgb);
    vec3 focusAvg = (f_n + f_s + f_e + f_w) * 0.25;

    float distToCenter = distance(uv, vec2(0.5));
    float focusMask = 1.0 - smoothstep(0.0, 0.7, distToCenter);
    
    color += (color - avg) * u_sharpening * 0.4;
    color += (color - focusAvg) * u_focus * 0.6 * focusMask;
    
    color = max(color, 0.0);

    // -- 12. Tone Mapping (Soft Shoulder) --
    color = toneMap(color);

    // -- 13. Re-gamma to sRGB --
    color = toSRGB(color);

    // -- 14. Sepia (Apply in sRGB as traditional filters are designed for it) --
    if (u_sepia > 0.0) {
        vec3 sepiaColor = vec3(
            dot(color, vec3(0.393, 0.769, 0.189)), 
            dot(color, vec3(0.349, 0.686, 0.168)), 
            dot(color, vec3(0.272, 0.534, 0.131))
        );
        color = mix(color, sepiaColor, u_sepia);
    }

    // -- 15. Final Final effects (Vignette, Grain) --
    distToCenter = distance(uv, vec2(0.5));
    color *= smoothstep(0.8, 0.8 - u_vignette * 0.4, distToCenter);
    
    // Grain with Luminance mask (Issue 10)
    float noiseVal = (fract(sin(dot(uv + u_time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
    float grainMask = 1.0 - luma; // More visible in shadows/midtone
    color += noiseVal * u_grain * 0.12 * grainMask;

    outColor = vec4(clamp(color, 0.0, 1.0), tex.a);
  }
`;
