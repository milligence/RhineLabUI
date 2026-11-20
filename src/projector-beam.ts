import * as THREE from "three";
import { Pass } from "three/addons/postprocessing/Pass.js";

export type ProjectorBeamFrame = {
  /** Actual world-space glass aperture, ordered TL, TR, BR, BL. */
  source: readonly THREE.Vector3[];
  /** The fixed world-space receiving plane, in the same corner order. */
  receiver: readonly THREE.Vector3[];
  reach: number;
  spread?: number;
  power: number;
  visible?: boolean;
  /** The scene's continuous theme amount, or an explicit light/dark endpoint. */
  dark?: number | boolean;
  /** Drawing-buffer pixels per displayed CSS pixel, including stage scaling. */
  pixelRatio?: number;
};

const unit = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const finiteQuad = (points: readonly THREE.Vector3[]) => points.length === 4 &&
  points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z));

/** Four transparent optical side surfaces in the actual scene. There is no
 * source cap, receiver cap or screen-space carrier cutout. A ray in front of
 * the carrier remains in front; opaque scene geometry supplies its depth.
 * The receiving image is composited above the scene, not beneath a white veil.
 */
export class ProjectorBeam {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  /** Include this in the scene's static-frame cache: corner buffers are dynamic. */
  revision = 0;
  private readonly owner: THREE.Scene;
  private readonly positions = new Float32Array(4 * 4 * 3);
  private readonly target = Array.from({ length: 4 }, () => new THREE.Vector3());
  private readonly centre = new THREE.Vector3();
  private readonly lightTint = new THREE.Color("#978b78");
  private readonly darkTint = new THREE.Color("#b9b4a4");
  private readonly darkUniform = { value: 0 };
  private readonly pixelRatioUniform = { value: 1 };
  private readonly occlusionUniform = { value: 0 };
  private readonly depthUniform: { value: THREE.Texture | null } = { value: null };
  private readonly viewportUniform = { value: new THREE.Vector2(1, 1) };
  private readonly edgeUniform = { value: new THREE.Color("#f2ecdc") };
  private state = { reach: 0, spread: 1, power: 0, dark: 0, pixelRatio: 1, valid: false };
  private disposed = false;
  private postProcessing = false;

  constructor(scene: THREE.Scene) {
    this.owner = scene;
    const geometry = new THREE.BufferGeometry();
    const uv = new Float32Array(4 * 4 * 2), indices: number[] = [];
    for (let side = 0; side < 4; side++) {
      uv.set([0, 0, 1, 0, 1, 1, 0, 1], side * 8);
      const start = side * 4;
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(this.positions.length), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(indices);

    const material = new THREE.MeshBasicMaterial({
      color: this.lightTint,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      fog: false,
    });
    // These are thin scattering surfaces, not two separately coated glass faces.
    material.forceSinglePass = true;
    material.customProgramCacheKey = () => "rhine-projector-side-surfaces-v3";
    material.onBeforeCompile = shader => {
      shader.uniforms.uProjectorDark = this.darkUniform;
      shader.uniforms.uProjectorPixelRatio = this.pixelRatioUniform;
      shader.uniforms.uProjectorOcclusion = this.occlusionUniform;
      shader.uniforms.uProjectorDepth = this.depthUniform;
      shader.uniforms.uProjectorViewport = this.viewportUniform;
      shader.uniforms.uProjectorEdge = this.edgeUniform;
      shader.vertexShader = `
        varying vec2 vProjectorUv;
        varying vec3 vProjectorNormal;
        varying vec3 vProjectorView;
      ` + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
        #include <begin_vertex>
        vProjectorUv = uv;
        vProjectorNormal = normalize(normalMatrix * normal);
      `).replace("#include <project_vertex>", `
        #include <project_vertex>
        vProjectorView = -mvPosition.xyz;
      `);
      shader.fragmentShader = `
        uniform float uProjectorDark;
        uniform float uProjectorPixelRatio;
        uniform float uProjectorOcclusion;
        uniform sampler2D uProjectorDepth;
        uniform vec2 uProjectorViewport;
        uniform vec3 uProjectorEdge;
        varying vec2 vProjectorUv;
        varying vec3 vProjectorNormal;
        varying vec3 vProjectorView;
        #include <packing>
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
        // The narrow reflection and wider absorption shoulder remain a few
        // rendered pixels wide as the camera approaches. No procedural noise,
        // full-face white fill or terminal billboard is added.
        if (uProjectorOcclusion > 0.5) {
          float sceneDepth = unpackRGBAToDepth(texture2D(uProjectorDepth, gl_FragCoord.xy / uProjectorViewport));
          if (gl_FragCoord.z > sceneDepth + 0.000001) discard;
        }
        float edgeDistance = min(vProjectorUv.x, 1.0 - vProjectorUv.x);
        float pixel = max(length(vec2(dFdx(vProjectorUv.x), dFdy(vProjectorUv.x))) * uProjectorPixelRatio, 0.00005);
        float distancePx = edgeDistance / pixel;
        float cut = smoothstep(0.0, 0.18, distancePx);
        float lip = exp(-0.5 * pow((distancePx - 0.60) / 0.28, 2.0));
        float shoulder = exp(-0.5 * pow((distancePx - 2.25) / 0.85, 2.0)) * smoothstep(1.05, 1.45, distancePx);
        float grazing = pow(max(0.0, 1.0 - abs(dot(normalize(vProjectorNormal), normalize(vProjectorView)))), 0.75);
        float interior = pow(max(0.0, sin(vProjectorUv.x * 3.14159265)), 1.4);
        float body = (0.001 + 0.004 * grazing) * interior;
        float reflected = mix(0.22, 0.12, uProjectorDark) * lip;
        float absorbed = mix(0.30, 0.10, uProjectorDark) * shoulder;
        float faceAngle = 0.62 + 0.38 * grazing;
        float axial = mix(1.0, 0.76, smoothstep(0.0, 1.0, vProjectorUv.y));
        float terminal = 1.0 - 0.32 * smoothstep(0.975, 1.0, vProjectorUv.y);
        float collimation = 0.004 * exp(-vProjectorUv.y * 18.0) * interior;
        float opticalAlpha = cut * axial * terminal * (body + collimation + (reflected + absorbed) * faceAngle);
        // The narrow reflective lip and offset absorbing shoulder have their
        // own radiance. Mixing their colors into one broad ridge would erase
        // the dark edge on ivory, yet overexpose the same edge at night.
        vec3 reflectionTint = uProjectorEdge * mix(2.8, 0.40, uProjectorDark);
        vec3 absorptionTint = mix(vec3(0.045, 0.042, 0.036), vec3(0.070, 0.066, 0.057), uProjectorDark);
        vec3 bodyTint = diffuse * mix(0.8, 0.22, uProjectorDark);
        vec3 weightedRadiance = bodyTint * (body + collimation) +
          (reflectionTint * reflected + absorptionTint * absorbed) * faceAngle;
        outgoingLight = weightedRadiance / max(0.0001, body + collimation + (reflected + absorbed) * faceAngle);
        diffuseColor.a *= opticalAlpha;
        #include <opaque_fragment>
      `);
    };
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = "archive-projector-beam";
    this.mesh.visible = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 20;
    // Override depth/normal materials otherwise turn transparent light into a
    // solid obstacle. Both shared AO depth and standalone Bokeh depth omit it.
    this.mesh.userData.excludeFromAO = true;
    this.mesh.userData.excludeFromDepth = true;
    this.mesh.userData.projectorBeam = true;
    scene.add(this.mesh);
  }

  update(frame: ProjectorBeamFrame) {
    if (this.disposed) return;
    const reach = unit(frame.reach), spread = unit(frame.spread ?? 1), power = unit(frame.power);
    const dark = unit(typeof frame.dark === "boolean" ? Number(frame.dark) : frame.dark ?? 0);
    const requestedRatio = frame.pixelRatio ?? 1;
    const pixelRatio = Number.isFinite(requestedRatio) && requestedRatio > 0 ? Math.max(.5, Math.min(4, requestedRatio)) : 1;
    const valid = finiteQuad(frame.source) && finiteQuad(frame.receiver);
    const visible = frame.visible !== false && valid && power > 1e-5 && reach > 1e-5;
    let changed = visible !== this.mesh.visible || reach !== this.state.reach || spread !== this.state.spread ||
      power !== this.state.power || dark !== this.state.dark || pixelRatio !== this.state.pixelRatio || valid !== this.state.valid;
    this.mesh.visible = visible;
    this.mesh.material.opacity = visible ? power : 0;
    this.mesh.material.color.copy(this.lightTint).lerp(this.darkTint, dark);
    this.darkUniform.value = dark;
    this.pixelRatioUniform.value = pixelRatio;
    this.state = { reach, spread, power, dark, pixelRatio, valid };
    if (visible) {
      this.centre.set(0, 0, 0);
      for (const point of frame.receiver) this.centre.add(point);
      this.centre.multiplyScalar(.25);
      for (let i = 0; i < 4; i++) {
        // The widening field remains within the final receiver's convex area.
        // At full spread/reach its far boundary is exactly the real frame.
        this.target[i].copy(frame.receiver[i]).sub(this.centre).multiplyScalar(.08 + .92 * spread)
          .add(this.centre).sub(frame.source[i]).multiplyScalar(reach).add(frame.source[i]);
      }
      let geometryChanged = false;
      for (let side = 0; side < 4; side++) {
        const next = (side + 1) % 4;
        for (let corner = 0; corner < 4; corner++) {
          const point = corner === 0 ? frame.source[side] : corner === 1 ? frame.source[next] :
            corner === 2 ? this.target[next] : this.target[side];
          const offset = (side * 4 + corner) * 3;
          const x = Math.fround(point.x), y = Math.fround(point.y), z = Math.fround(point.z);
          geometryChanged ||= x !== this.positions[offset] || y !== this.positions[offset + 1] || z !== this.positions[offset + 2];
          this.positions[offset] = x;
          this.positions[offset + 1] = y;
          this.positions[offset + 2] = z;
        }
      }
      if (geometryChanged) {
        this.mesh.geometry.getAttribute("position").needsUpdate = true;
        this.mesh.geometry.computeVertexNormals();
        this.mesh.geometry.computeBoundingSphere();
        changed = true;
      }
    }
    if (changed) this.revision++;
  }

  /** Only a depth-of-field composite needs a later optical draw. Without DOF,
   * the original beauty pass supplies hardware depth with no extra depth pass. */
  setPostProcessingEnabled(enabled: boolean) {
    if (this.disposed || enabled === this.postProcessing) return;
    this.postProcessing = enabled;
    this.mesh.layers.set(enabled ? 1 : 0);
    this.revision++;
  }

  get usesPostProcessing() { return this.postProcessing; }

  /** Pass-local uniforms do not invalidate a stable scene's render cache. */
  setOcclusionDepth(texture: THREE.Texture | null, width = 1, height = 1) {
    this.depthUniform.value = texture;
    this.occlusionUniform.value = texture ? 1 : 0;
    this.viewportUniform.value.set(Math.max(1, width), Math.max(1, height));
  }

  getStats() {
    return { ...this.state, visible: this.mesh.visible, revision: this.revision,
      vertices: 16, triangles: 8, depthTest: true, depthWrite: false,
      excludeFromAO: true, excludeFromDepth: true, postProcessing: this.postProcessing, disposed: this.disposed };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.owner.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.visible = false;
    this.setOcclusionDepth(null);
    this.revision++;
  }
}

/** Draw after Bokeh and before SMAA/Output. Optical scattering is sharp while
 * the archive keeps its authored DOF. The existing packed scene depth supplies
 * true occlusion; this pass never creates a replacement silhouette or prepass. */
export class ProjectorBeamPass extends Pass {
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly beam: ProjectorBeam;
  private readonly getDepth: () => THREE.Texture | null;

  constructor(scene: THREE.Scene, camera: THREE.Camera, beam: ProjectorBeam, getDepth: () => THREE.Texture | null) {
    super();
    this.scene = scene; this.camera = camera; this.beam = beam; this.getDepth = getDepth;
    this.needsSwap = false;
    this.enabled = false;
  }

  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
    if (!this.beam.mesh.visible || !this.beam.usesPostProcessing) return;
    const depth = this.getDepth();
    // A missing depth cannot justify painting light across opaque archives.
    if (!depth) return;
    const background = this.scene.background, override = this.scene.overrideMaterial;
    const mask = this.camera.layers.mask, autoClear = renderer.autoClear;
    const target = renderer.getRenderTarget(), material = this.beam.mesh.material;
    const depthTest = material.depthTest;
    this.beam.setOcclusionDepth(depth, read.width, read.height);
    this.scene.background = null; this.scene.overrideMaterial = null;
    this.camera.layers.set(1);
    material.depthTest = false;
    renderer.autoClear = false;
    try {
      renderer.setRenderTarget(read);
      renderer.render(this.scene, this.camera);
    } finally {
      this.beam.setOcclusionDepth(null);
      material.depthTest = depthTest;
      this.camera.layers.mask = mask;
      this.scene.background = background; this.scene.overrideMaterial = override;
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(target);
    }
  }

  dispose() { this.beam.setOcclusionDepth(null); }
}
