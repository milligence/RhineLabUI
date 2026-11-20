import fs from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { installProjectorAperture, setProjectorAperturePower } from '../../src/projector-aperture.ts';
const data = await fs.readFile(new URL('../../public/assets/archive-cassette.glb', import.meta.url));
const gltf = await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
gltf.scene.updateMatrixWorld(true);
let source;
gltf.scene.traverse(object => {
  if (object instanceof THREE.Mesh && !Array.isArray(object.material) && object.material.name.startsWith('Optical_Diffuser')) source = object;
});
if (!source) throw new Error('Missing optical substrate');
const group = new THREE.Group();
const palettes = new Map();
const meshes = installProjectorAperture(group, {
  register: (name, high, low) => palettes.set(name, { high, low }),
}, source.geometry.clone().applyMatrix4(source.matrixWorld));
// The offline closeup inspects the extracted finish. The installer returns
// the resting material for background-instance integration.
for (const mesh of meshes) mesh.material = palettes.get(mesh.userData.surface).high;
setProjectorAperturePower(group, 1);
const output = meshes.map(mesh => ({
  role: mesh.userData.projectorRole,
  vertices: Array.from(mesh.geometry.getAttribute('position').array),
  normals: Array.from(mesh.geometry.getAttribute('normal').array),
  indices: mesh.geometry.index ? Array.from(mesh.geometry.index.array) : null,
  material: {
    color: mesh.material.color.toArray(), metalness: mesh.material.metalness,
    roughness: mesh.material.roughness, transmission: mesh.material.transmission,
    ior: mesh.material.ior, thickness: mesh.material.thickness,
    clearcoat: mesh.material.clearcoat, clearcoatRoughness: mesh.material.clearcoatRoughness,
    emissive: mesh.material.emissive.toArray(), emissiveIntensity: mesh.material.emissiveIntensity,
  },
}));
await fs.writeFile(new URL('./geometry.json', import.meta.url), JSON.stringify(output));
console.log('Exported runtime geometry and normals for offline inspection.');
