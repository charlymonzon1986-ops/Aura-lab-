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
  // Prevents "Broken/Psychedelic" colors when values exceed 1.0
  vec3 toneMap(vec3 x) {
    // A professional "Soft-Knee" tone mapper with high dynamic range support
    float white = 8.0; 
    return (x * (1.0 + x / (white * white))) / (1.0 + x);
  }

  // Stable Contrast (S-Curve)
  vec3 applyContrast(vec3 color, float contrast) {
    if (abs(contrast - 100.0) < 0.1) return color;
    // We use a mid-point centered S-curve for professional look
    float k = (contrast / 100.0) - 1.0;
    vec3 c = color;
    return mix(c, smoothstep(0.0, 1.0, c), k * 0.5 + 0.0); // If k is 0, mix is (c, s, 0) which is c. Correct.
  }

  // Better Saturation (Luminance preserving)
  vec3 applySaturation(vec3 color, float sat) {
    float luma = getLuma(color);
    return mix(vec3(luma), color, sat);
  }

  // HSL-based Vibrance (Smart saturation)
  vec3 applyVibrance(vec3 color, float vib) {
    if (abs(vib) < 0.01) return color;
    float maxCol = max(color.r, max(color.g, color.b));
    float minCol = min(color.r, min(color.g, color.b));
    float sat = (maxCol - minCol) / (maxCol + 1e-6);
    
    // Targeted saturation for low-sat pixels
    float amt = vib * (1.0 - sat) * 0.5;
    return color * (1.0 + amt);
  }

  // Split Toning
  vec3 applySplitToning(vec3 color, vec3 sTint, vec3 mTint, vec3 hTint, float balance) {
    float luma = clamp(getLuma(color), 0.0, 1.0);
    
    float sMask = smoothstep(0.5 + balance * 0.3, 0.1 + balance * 0.3, luma);
    float hMask = smoothstep(0.4 + balance * 0.3, 0.9 + balance * 0.3, luma);
    float mMask = clamp(1.0 - sMask - hMask, 0.0, 1.0);
    
    color += sTint * sMask * 0.25;
    color += mTint * mMask * 0.15;
    color += hTint * hMask * 0.1;
    
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

    // -- 2. Noise Reduction & Blur (Spatial filters) --
    if (u_blur > 0.01 || u_noiseReduction > 0.01) {
        float blurRadius = (u_blur * 5.0 + u_noiseReduction * 2.0) / u_resolution.x;
        vec3 blurred = color * 0.4;
        blurred += texture(u_image, uv + vec2(blurRadius, 0.0)).rgb * 0.15;
        blurred += texture(u_image, uv - vec2(blurRadius, 0.0)).rgb * 0.15;
        blurred += texture(u_image, uv + vec2(0.0, blurRadius)).rgb * 0.15;
        blurred += texture(u_image, uv - vec2(0.0, blurRadius)).rgb * 0.15;
        color = mix(color, blurred, clamp(u_blur * 0.5 + u_noiseReduction * 0.8, 0.0, 1.0));
    }

    // -- 3. Linearize (Safe version) --
    color = toLinear(color);

    // -- 4. Exposure & Brightness (In Linear space) --
    color *= pow(2.0, clamp(u_exposure, -5.0, 5.0));
    color *= u_brightness;
    color = max(color, 0.0);

    // -- 5. White Balance --
    float t = u_temp * 0.1;
    float ti = u_tint * 0.05;
    color.r *= (1.0 + t);
    color.b *= (1.0 - t);
    color.g *= (1.0 - ti);
    // Fix: rb swizzle assignment is not safe in all versions
    float tintBoost = (1.0 + ti * 0.4);
    color.r *= tintBoost;
    color.b *= tintBoost;
    color = max(color, 0.0);

    // -- 6. Basics: Highlights/Shadows/Whites/Blacks --
    float luma = getLuma(color);
    float hMask = smoothstep(0.4, 0.9, luma);
    float sMask = 1.0 - smoothstep(0.1, 0.6, luma);
    float wMask = smoothstep(0.7, 1.0, luma);
    float bMask = 1.0 - smoothstep(0.0, 0.3, luma);
    
    if (u_highlights < 0.0) {
        color = mix(color, color * (1.0 + u_highlights * 0.6), hMask);
    } else {
        color += u_highlights * 0.1 * hMask;
    }
    
    if (u_shadows > 0.0) {
        color = mix(color, 1.0 - (1.0 - color) * (1.0 - u_shadows * 0.4), sMask);
    } else {
        color *= (1.0 + u_shadows * 0.3 * sMask);
    }
    
    color += u_whites * 0.15 * wMask;
    color += u_blacks * 0.15 * bMask;
    color = max(color, 0.0);

    // -- 7. Clarity & Texture --
    float midtoneMask = smoothstep(0.1, 0.5, luma) * (1.0 - smoothstep(0.5, 0.9, luma));
    color += (color - 0.5) * u_clarity * midtoneMask * 0.4;
    color += (color - 0.5) * u_texture * 0.2;
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

    // -- 11. Creative: Dehaze, Sepia, Sharpness --
    if (abs(u_dehaze) > 0.01) {
        float d = u_dehaze * 0.15;
        color = (color - d) / (1.0 - abs(d) + 0.0001);
    }
    if (u_sepia > 0.0) {
        vec3 sepiaColor = vec3(dot(color, vec3(0.393, 0.769, 0.189)), dot(color, vec3(0.349, 0.686, 0.168)), dot(color, vec3(0.272, 0.534, 0.131)));
        color = mix(color, sepiaColor, u_sepia);
    }
    
    // Sharpness (High-pass filter in linear space)
    float finalSharp = u_sharpening + u_focus;
    if (finalSharp > 0.0) {
        vec2 stepSize = 1.0 / u_resolution;
        vec3 n = toLinear(texture(u_image, uv + vec2(0.0, stepSize.y)).rgb);
        vec3 s = toLinear(texture(u_image, uv - vec2(0.0, stepSize.y)).rgb);
        vec3 e = toLinear(texture(u_image, uv + vec2(stepSize.x, 0.0)).rgb);
        vec3 w = toLinear(texture(u_image, uv - vec2(stepSize.x, 0.0)).rgb);
        vec3 avg = (n + s + e + w) * 0.25;
        color += (color - avg) * finalSharp * 0.4;
    }
    color = max(color, 0.0);

    // -- 12. Tone Mapping --
    color = toneMap(color);

    // -- 13. Re-gamma to sRGB --
    color = toSRGB(color);

    // -- 14. Final Final effects (Vignette, Grain) --
    float distToCenter = distance(uv, vec2(0.5));
    color *= smoothstep(0.8, 0.8 - u_vignette * 0.4, distToCenter);
    float noiseVal = (fract(sin(dot(uv + u_time, vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
    color += noiseVal * u_grain * 0.08;

    outColor = vec4(clamp(color, 0.0, 1.0), tex.a);
  }
`;
