import * as THREE from "three";

// Paint the existing surface; never split, move, or add printable geometry.
export function createBorderMaterial(artworkMaterial) {
  const material = artworkMaterial.clone();
  const uniforms = {
    borderColor: { value: new THREE.Color("#2455a4") },
    artworkMask: { value: null },
    maskBounds: { value: new THREE.Vector4() },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = "varying vec2 borderPosition;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>",
      "#include <begin_vertex>\nborderPosition = position.xy;");
    shader.fragmentShader = "varying vec2 borderPosition;\nuniform vec3 borderColor;\nuniform sampler2D artworkMask;\nuniform vec4 maskBounds;\n" + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>",
      `#include <color_fragment>
      vec2 maskUV = (borderPosition - maskBounds.xy) / maskBounds.zw;
      float artwork = texture2D(artworkMask, maskUV).r;
      diffuseColor.rgb = mix(borderColor, diffuseColor.rgb, artwork);`);
  };
  material.customProgramCacheKey = () => "clicker-border-mask-v1";
  return {
    material,
    color: uniforms.borderColor.value,
    update(loops, fit, scaleMultiplier) {
      const scale = fit.scale * scaleMultiplier;
      const points = loops.flat();
      const minX = Math.min(...points.map(p => p.x)) - 2 / scale;
      const minY = Math.min(...points.map(p => p.y)) - 2 / scale;
      const maxX = Math.max(...points.map(p => p.x)) + 2 / scale;
      const maxY = Math.max(...points.map(p => p.y)) + 2 / scale;
      const width = maxX - minX, height = maxY - minY;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 2048;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      for (const loop of loops) {
        loop.forEach((p, i) => {
          const x = (p.x - minX) / width * canvas.width;
          const y = (p.y - minY) / height * canvas.height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fillStyle = "white";
      ctx.fill("evenodd");
      uniforms.artworkMask.value?.dispose();
      uniforms.artworkMask.value = new THREE.CanvasTexture(canvas);
      uniforms.maskBounds.value.set((minX - fit.centerPxX) * scale,
        (fit.centerPxY - maxY) * scale, width * scale, height * scale);
    },
  };
}
