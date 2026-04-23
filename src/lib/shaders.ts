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

  // -- ADJUSTMENT UNIFORMS --
  uniform float u_exposure;    
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

  // Linear to sRGB
  vec3 sRGB(vec3 color) {
    return pow(color, vec3(1.0/2.2));
  }

  // sRGB to Linear
  vec3 linear(vec3 color) {
    return pow(color, vec3(2.2));
  }

  // Sigmoid contrast (Professional S-Curve)
  vec3 applyContrast(vec3 color, float contrast) {
    if (contrast == 1.0) return color;
    vec3 x = color;
    float c = contrast;
    // More natural S-curve than linear contrast
    return 1.0 / (1.0 + exp(-c * (x - 0.5))) * (1.0 + exp(-c * (1.0 - 0.5))) + (1.0 / (1.0 + exp(-c * (0.0 - 0.5))));
    // Simple S-curve fallback for stability
    // return mix(color, smoothstep(0.0, 1.0, color), (contrast - 1.0) * 0.5 + 0.5);
  }
  
  // Real contrast
  vec3 applyRealContrast(vec3 color, float contrast) {
     return (color - 0.5) * contrast + 0.5;
  }

  // Split Toning (Professional 3-Way version)
  vec3 applySplitToning(vec3 color, vec3 sTint, vec3 mTint, vec3 hTint, float balance) {
    float luma = getLuma(color);
    
    // Adobe Style masks
    float sMask = smoothstep(0.55 + balance * 0.2, 0.15 + balance * 0.2, luma);
    float hMask = smoothstep(0.45 + balance * 0.2, 0.85 + balance * 0.2, luma);
    float mMask = clamp(1.0 - sMask - hMask, 0.0, 1.0);
    
    // Use Overlay blending for more realistic color integration
    vec3 shadowResult = color + sTint * 0.3 * sMask;
    vec3 midtoneResult = color + mTint * 0.25 * mMask;
    vec3 highlightResult = color + hTint * 0.2 * hMask;
    
    return mix(color, shadowResult, sMask) + (midtoneResult - color) * mMask + (highlightResult - color) * hMask;
  }

  vec3 applyTonal(vec3 color, float highlights, float shadows, float whites, float blacks) {
    float luma = getLuma(color);
    
    // Better masks for professional editing
    float hMask = smoothstep(0.5, 1.0, luma);
    float sMask = 1.0 - smoothstep(0.0, 0.5, luma);
    float wMask = smoothstep(0.8, 1.0, luma);
    float bMask = 1.0 - smoothstep(0.0, 0.2, luma);
    
    // Highlights & Shadows (Curve based)
    if (highlights < 0.0) {
        color = mix(color, color * (1.0 + highlights * 0.8), hMask);
    } else {
        color += highlights * 0.15 * hMask;
    }
    
    if (shadows > 0.0) {
        color = mix(color, 1.0 - (1.0 - color) * (1.0 - shadows * 0.5), sMask);
    } else {
        color *= (1.0 + shadows * 0.4 * sMask);
    }
    
    // Whites/Blacks (Point adjustment)
    color += whites * 0.2 * wMask;
    color += blacks * 0.2 * bMask;
    
    return color;
  }

  void main() {
    vec4 tex = texture2D(u_image, v_texCoord);
    vec3 color = tex.rgb;

    // 0. Pre-conversion to Linear Space for realistic physics
    color = linear(color);

    // 1. Exposure (Linear math is correct)
    color *= pow(2.0, u_exposure);

    // 2. White Balance (Temperature/Tint)
    float t = u_temp * 0.1;
    float ti = u_tint * 0.05;
    color.r *= (1.0 + t);
    color.b *= (1.0 - t);
    color.g *= (1.0 - ti);
    color.rb *= (1.0 + ti * 0.5);

    // 3. Tonal Mapping (Professional Recovery)
    color = applyTonal(color, u_highlights, u_shadows, u_whites, u_blacks);

    // 4. Contrast (Sigmoid for roll-off)
    float c = (u_contrast - 1.0) * 0.5 + 1.0;
    color = (color - 0.5) * c + 0.5;
    // Apply soft-shoulder highlights
    color = mix(color, 1.0 - exp(-color * 1.5), smoothstep(0.7, 1.2, getLuma(color)));

    // 5. Clarity & Texture (Local Contrast)
    float luma = getLuma(color);
    float midtoneMask = smoothstep(0.1, 0.5, luma) * (1.0 - smoothstep(0.5, 0.9, luma));
    
    // Clarity (Professional lookup)
    if (u_clarity != 0.0) {
        vec3 clarityColor = (color - 0.5) * u_clarity * midtoneMask * 0.5 + 0.5;
        color = mix(color, clarityColor, abs(u_clarity) * 0.5);
    }
    
    // Texture
    color += (color - 0.5) * u_texture * 0.25;
    
    // 6. Dehaze
    if (u_dehaze != 0.0) {
        float dehaze = u_dehaze * 0.2;
        color = (color - dehaze) / (1.0 - abs(dehaze));
    }

    // 7. Saturation & Vibrance (Luminance preserving)
    float maxColor = max(color.r, max(color.g, color.b));
    float minColor = min(color.r, min(color.g, color.b));
    float sat = (maxColor - minColor) / (maxColor + 1e-5);
    
    // Saturation
    color = mix(vec3(luma), color, u_saturation);
    
    // Vibrance (Smart saturation)
    float vibranceAmount = u_vibrance * (1.0 - sat) * 0.8;
    color = mix(color, mix(vec3(luma), color, 1.0 + vibranceAmount), 0.5);

    // 8. Color Grading (Split Toning)
    color = applySplitToning(color, linear(u_shadowTint), linear(u_midtoneTint), linear(u_highlightTint), u_balance);

    // 9. Sharpness (Post-grading)
    if (u_sharpening > 0.0) {
        vec2 step = 1.0 / u_resolution;
        vec3 n = linear(texture2D(u_image, v_texCoord + vec2(0.0, step.y)).rgb);
        vec3 s = linear(texture2D(u_image, v_texCoord - vec2(0.0, step.y)).rgb);
        vec3 e = linear(texture2D(u_image, v_texCoord + vec2(step.x, 0.0)).rgb);
        vec3 w = linear(texture2D(u_image, v_texCoord - vec2(step.x, 0.0)).rgb);
        vec3 avg = (n + s + e + w) * 0.25;
        color += (color - avg) * u_sharpening * 0.5;
    }

    // 10. Creative Effects (Sepia, Grain, Vignette)
    if (u_sepia > 0.0) {
        vec3 sepiaColor = vec3(
            dot(color, vec3(0.393, 0.769, 0.189)),
            dot(color, vec3(0.349, 0.686, 0.168)),
            dot(color, vec3(0.272, 0.534, 0.131))
        );
        color = mix(color, sepiaColor, u_sepia);
    }

    // Vignette
    float dist = distance(v_texCoord, vec2(0.5));
    color *= smoothstep(0.8, 0.8 - u_vignette * 0.45, dist);

    // Grain
    float noise = (fract(sin(dot(v_texCoord + u_time ,vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
    color += noise * u_grain * 0.1;

    // 11. Final conversion to sRGB for display
    color = sRGB(color);

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), tex.a);
  }
`;
