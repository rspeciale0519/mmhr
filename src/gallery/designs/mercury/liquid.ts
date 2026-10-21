/**
 * A small WebGL2 renderer for liquid-chrome drops. Each drop is a metaball;
 * where fields overlap, drops merge. Shading treats the merged field as a
 * sphere-like surface and reflects a simple studio environment, which reads
 * as polished metal. No library is needed for one full-screen triangle.
 */
export type Drop = { x: number; y: number; r: number };

export type LiquidRenderer = {
  resize: (width: number, height: number, ratio: number) => void;
  draw: (drops: readonly Drop[], time: number, dark: boolean) => void;
  dispose: () => void;
};

export const MAX_DROPS = 7;

const vertex = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform vec3 uDrops[${MAX_DROPS}];
uniform float uDark;
uniform float uTime;
out vec4 outColor;

vec3 environment(vec3 r) {
  float y = r.y + 0.38 * r.z;
  vec3 sky = mix(vec3(0.95, 0.96, 1.0), vec3(0.20, 0.23, 0.34), uDark);
  vec3 haze = mix(vec3(0.74, 0.77, 0.87), vec3(0.36, 0.38, 0.52), uDark);
  vec3 violet = vec3(0.33, 0.19, 0.91);
  vec3 cyan = vec3(0.12, 0.71, 0.88);
  vec3 color = mix(haze, sky, smoothstep(0.02, 0.7, y));
  color = mix(color, vec3(0.07, 0.08, 0.13), smoothstep(0.05, -0.02, y));
  vec3 ground = mix(violet, cyan, smoothstep(-0.15, -0.85, y + 0.25 * r.x));
  return mix(color, ground, smoothstep(-0.06, -0.38, y));
}

void main() {
  vec2 p = gl_FragCoord.xy;
  float field = 0.0;
  vec2 gradient = vec2(0.0);
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    vec2 d = p - uDrops[i].xy;
    float rr = uDrops[i].z * uDrops[i].z;
    float dd = max(dot(d, d), 1.0);
    field += rr / dd;
    gradient -= 2.0 * rr * d / (dd * dd);
  }
  float edge = fwidth(field);
  float alpha = smoothstep(1.0 - edge, 1.0 + edge, field);
  if (alpha <= 0.0) { outColor = vec4(0.0); return; }

  // For one drop, 1/field is (distance/radius)^2, so this is a sphere normal.
  float inv = clamp(1.0 / field, 0.0, 1.0);
  vec2 outward = -normalize(gradient + vec2(1e-6));
  vec3 normal = normalize(vec3(outward * sqrt(inv), sqrt(1.0 - inv)));
  vec3 reflected = reflect(vec3(0.0, 0.0, -1.0), normal);

  vec3 color = environment(reflected);
  float fresnel = pow(1.0 - normal.z, 3.0);
  vec3 film = 0.5 + 0.5 * cos(6.2832 * (fresnel * 1.3 + vec3(0.0, 0.33, 0.67)) + uTime * 0.25);
  color = mix(color, color * film * 1.5, fresnel * 0.35);
  vec3 light = normalize(vec3(-0.45, 0.62, 0.64));
  color += vec3(1.0) * pow(max(dot(reflected, light), 0.0), 48.0) * 0.9;
  outColor = vec4(clamp(color, 0.0, 1.0) * alpha, alpha);
}`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** Returns null when WebGL2 is unavailable, so the page can show its still fallback. */
export function createLiquid(canvas: HTMLCanvasElement): LiquidRenderer | null {
  const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, antialias: false, alpha: true });
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  // One triangle that covers the whole canvas.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "aPosition");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uResolution = gl.getUniformLocation(program, "uResolution");
  const uDrops = gl.getUniformLocation(program, "uDrops");
  const uDark = gl.getUniformLocation(program, "uDark");
  const uTime = gl.getUniformLocation(program, "uTime");
  const packed = new Float32Array(MAX_DROPS * 3);
  let scale = 1;
  let height = 0;

  return {
    resize(width, nextHeight, ratio) {
      scale = ratio;
      height = nextHeight;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(nextHeight * ratio));
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    draw(drops, time, dark) {
      packed.fill(0);
      drops.slice(0, MAX_DROPS).forEach((drop, index) => {
        packed[index * 3] = drop.x * scale;
        packed[index * 3 + 1] = (height - drop.y) * scale;
        packed[index * 3 + 2] = drop.r * scale;
      });
      gl.useProgram(program);
      gl.uniform2f(uResolution, canvas.width, canvas.height);
      gl.uniform3fv(uDrops, packed);
      gl.uniform1f(uDark, dark ? 1 : 0);
      gl.uniform1f(uTime, time);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    },
  };
}
