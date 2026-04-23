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
  
  // -- COLOR GRADING --
  uniform vec3 u_shadowTint;    // Split toning shadows
  uniform vec3 u_highlightTint; // Split toning highlights
  uniform float u_balance;      // Split toning balance

  // -- HELPER FUNCTIONS --
  
  float getLuma(vec3 color) {
    return dot(color, vec3(0.2126, 0.7152, 0.0722));
  }

  vec3 applyContrast(vec3 color, float contrast) {
    return (color - 0.5) * contrast + 0.5;
  }

  // Split Toning (Adobe Lightroom style)
  vec3 applySplitToning(vec3 color, vec3 sTint, vec3 hTint, float balance) {
    float luma = getLuma(color);
    float pivot = 0.5 + balance * 0.4;
    
    vec3 shadows = mix(color, color + sTint, 1.0 - smoothstep(0.0, pivot, luma));
    vec3 highlights = mix(shadows, shadows + hTint, smoothstep(pivot, 1.0, luma));
    
    return highlights;
  }

  vec3 applyTonal(vec3 color, float highlights, float shadows, float whites, float blacks) {
    float luma = getLuma(color);
    float hMask = smoothstep(0.45, 0.9, luma);
    float sMask = 1.0 - smoothstep(0.1, 0.55, luma);
    
    // Highlight recovery (Soft shoulder)
    if (highlights < 0.0) {
        color = mix(color, color * (1.0 + highlights * 0.7), hMask);
    } else {
        color = mix(color, color + (1.0 - color) * highlights * hMask, 0.3);
    }
    
    // Shadow lift (Linear lift in blacks)
    color += ghosts(shadows) * sMask * 0.15;
    
    // Whites/Blacks clipping points
    color += whites * smoothstep(0.75, 1.0, luma) * 0.25;
    color += blacks * (1.1 - smoothstep(0.0, 0.25, luma)) * 0.25;
    
    return color;
  }

  float ghosts(float x) { return x * abs(x); }

  void main() {
    vec4 tex = texture2D(u_image, v_texCoord);
    vec3 color = tex.rgb;

    // 1. Exposure
    color *= pow(2.0, u_exposure);

    // 2. White Balance
    color.r += u_temp * 0.06;
    color.b -= u_temp * 0.06;
    color.g -= u_tint * 0.06;

    // 3. Tonal Mapping
    color = applyTonal(color, u_highlights, u_shadows, u_whites, u_blacks);

    // 4. Contrast
    color = applyContrast(color, u_contrast);

    // 5. Split Toning
    color = applySplitToning(color, u_shadowTint * 0.1, u_highlightTint * 0.1, u_balance);

    // 6. Clarity & Presence
    float luma = getLuma(color);
    float midtoneMask = smoothstep(0.2, 0.5, luma) * (1.0 - smoothstep(0.5, 0.8, luma));
    color += (color - 0.5) * u_clarity * midtoneMask * 0.4;
    
    if (u_dehaze != 0.0) {
        color = (color - 0.15 * u_dehaze) / (1.0 - 0.1 * abs(u_dehaze));
    }

    // 7. Saturation & Vibrance
    float maxColor = max(color.r, max(color.g, color.b));
    float satMask = (maxColor - luma);
    color = mix(vec3(luma), color, u_saturation);
    color += satMask * u_vibrance * 0.5;

    // 8. Vignette
    float dist = distance(v_texCoord, vec2(0.5));
    color *= smoothstep(0.8, 0.8 - u_vignette * 0.4, dist);

    // 9. Grain
    float noise = (fract(sin(dot(v_texCoord + u_time ,vec2(12.9898, 78.233))) * 43758.5453) - 0.5);
    color += noise * u_grain * 0.08;

    gl_FragColor = vec4(clamp(color, 0.0, 1.0), tex.a);
  }
`;
