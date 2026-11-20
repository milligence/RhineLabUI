import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CardAppearance } from "./appearance";

/** Local coordinates on the unchanged cassette. The aperture lies in front of
 * the original cover (z=.174… .206); its housing remains inside the card face.
 * The camera projects these actual corners, never a screen-space substitute. */
export const PROJECTOR_APERTURE = {
  center: { x: 1.25, y: 3.43, z: .252 },
  corners: [
    { x: .63, y: 3.53, z: .252 },
    { x: 1.87, y: 3.53, z: .252 },
    { x: 1.87, y: 3.33, z: .252 },
    { x: .63, y: 3.33, z: .252 },
  ],
  normal: { x: 0, y: 0, z: 1 },
  width: 1.24,
  height: .20,
} as const;

type Surface = THREE.MeshPhysicalMaterial;
type PortMesh = THREE.Mesh<THREE.BufferGeometry, Surface>;
type Registration = Pick<CardAppearance, "register">;
type Role = "frame" | "well" | "glass" | "emitter";
const names: Record<Role, string> = {
  frame: "Projector_Frame",
  well: "Projector_Well",
  glass: "Projector_Glass",
  emitter: "Projector_Emitter",
};

/** Reuse the Blender-authored closed, bevelled Optical_Diffuser substrate.
 * The outer Frosted_Polymer cover contains fastener holes and an index notch;
 * reusing it would reproduce those openings across the optical components.
 * Nonuniform scaling is
 * baked into vertices and normals before meshes enter the ordinary appearance
 * system, just as it is for the existing asset's material groups. */
function normalizedSubstrate(source: THREE.BufferGeometry) {
  const geometry = source.clone();
  geometry.deleteAttribute("archiveTheme");
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const size = bounds.getSize(new THREE.Vector3());
  if (Math.min(size.x, size.y, size.z) <= 1e-7) {
    geometry.dispose();
    throw new Error("The projector aperture requires the closed cassette substrate geometry");
  }
  const centre = bounds.getCenter(new THREE.Vector3());
  geometry.translate(-centre.x, -centre.y, -centre.z);
  geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
  return geometry;
}

function piece(unit: THREE.BufferGeometry, x: number, y: number, z: number,
  width: number, height: number, depth: number) {
  return unit.clone().scale(width, height, depth).translate(x, y, z);
}

function join(parts: THREE.BufferGeometry[]) {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error("Projector housing geometry could not be combined");
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function palettes() {
  const frame = new THREE.MeshPhysicalMaterial({
    color: "#e8e1d7", metalness: .08, roughness: .23,
    clearcoat: .55, clearcoatRoughness: .12,
  });
  const well = new THREE.MeshPhysicalMaterial({
    color: "#252c2b", metalness: .30, roughness: .36,
    clearcoat: .18, clearcoatRoughness: .18,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: "#faf7ef", metalness: 0, roughness: .075,
    transmission: .91, thickness: .036, ior: 1.46,
    attenuationColor: "#d7c8b2", attenuationDistance: .75,
    clearcoat: 1, clearcoatRoughness: .035,
    emissive: "#fff0cf", emissiveIntensity: 0,
  });
  const emitter = new THREE.MeshPhysicalMaterial({
    color: "#665c49", metalness: .08, roughness: .26,
    emissive: "#fff1ce", emissiveIntensity: 0,
  });
  const high = { frame, well, glass, emitter };
  const low = {
    frame: frame.clone(), well: well.clone(),
    glass: glass.clone(), emitter: emitter.clone(),
  };
  // The hardware exists before extraction. Only its optical finish resolves
  // with the selected cassette; there is no independent visibility pop.
  low.glass.roughness = .19;
  low.glass.transmission = .68;
  low.glass.clearcoat = .45;
  low.frame.roughness = .34;
  for (const role of Object.keys(high) as Role[]) {
    high[role].name = names[role];
    low[role].name = names[role];
    high[role].envMapIntensity = low[role].envMapIntensity = .6;
  }
  return { high, low };
}

/** Install once while loading a cassette, before CardAppearance.prepare and
 * before adding its printed label. Every new child is a normal material-group
 * Mesh: returning-card clones keep the existing independent-material path.
 * Returned meshes initially use the resting finish, allowing the array to
 * clone that same material before prepare installs an independent high clone.
 * Palette source materials are owned by CardAppearance.disposeSources; mesh
 * geometries are owned by the scene's existing disposeThreeTree lifecycle. */
export function installProjectorAperture(
  model: THREE.Group,
  appearance: Registration,
  substrateGeometry: THREE.BufferGeometry,
): PortMesh[] {
  const existing = model.children.filter(child => child.userData.projectorAperture) as PortMesh[];
  if (existing.length) return existing;
  const unit = normalizedSubstrate(substrateGeometry);
  const x = PROJECTOR_APERTURE.center.x, y = PROJECTOR_APERTURE.center.y;
  const geometry: Record<Role, THREE.BufferGeometry> = {
    frame: join([
      piece(unit, x, y + .125, .2325, 1.36, .03, .051),
      piece(unit, x, y - .125, .2325, 1.36, .03, .051),
      piece(unit, x - .665, y, .2325, .03, .22, .051),
      piece(unit, x + .665, y, .2325, .03, .22, .051),
    ]),
    well: piece(unit, x, y, .197, 1.34, .24, .020),
    glass: piece(unit, x, y, .234, 1.24, .20, .036),
    emitter: piece(unit, x, y, .2115, 1.14, .108, .005),
  };
  unit.dispose();
  const { high, low } = palettes();
  const meshes: PortMesh[] = [];
  for (const role of ["frame", "well", "emitter", "glass"] as Role[]) {
    appearance.register(names[role], high[role], low[role]);
    const mesh = new THREE.Mesh(geometry[role], low[role]);
    mesh.name = names[role];
    mesh.userData.surface = names[role];
    mesh.userData.assemblyPart = "cover";
    mesh.userData.projectorAperture = true;
    mesh.userData.projectorRole = role;
    mesh.receiveShadow = role !== "glass" && role !== "emitter";
    mesh.castShadow = false;
    model.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

/** Apply after ordinary appearance updates. The emitter remains behind its
 * glass cover, so a power change illuminates the cavity instead of painting
 * a new, unrelated shape over the outside of the archive. Track emissive
 * intensity in the scene's render-input cache while the camera is stationary. */
export function setProjectorAperturePower(model: THREE.Object3D, value: number) {
  const power = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
  model.traverse(child => {
    if (!(child instanceof THREE.Mesh) || !child.userData.projectorAperture) return;
    const material = child.material as Surface;
    const role = child.userData.projectorRole as Role;
    material.emissiveIntensity = role === "emitter" ? 3.6 * power ** 1.2 : role === "glass" ? .035 * power : 0;
    child.userData.projectorPower = power;
  });
}
