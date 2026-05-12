import * as THREE from 'three';
import { ColladaExporter } from 'three-stdlib';

const scene = new THREE.Scene();
const geo = new THREE.BoxGeometry(1, 1, 1);
const mat = new THREE.MeshBasicMaterial();
const mesh = new THREE.Mesh(geo, mat);
scene.add(mesh);

const exporter = new ColladaExporter();
const res = exporter.parse(scene, undefined, { version: '1.4.1' });
console.log(Object.keys(res || {}));
console.log(typeof res?.data);
console.log(res?.data?.substring(0, 100));
