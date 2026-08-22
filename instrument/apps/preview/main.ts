import * as THREE from "three";
import body from "./body.json";

const tag0 = document.getElementById("tag")!;
tag0.innerHTML =
  `PANORAMIC · FRAME INSTRUMENT<span class="accent"> ●</span> NIGHT BUILD\n` +
  `BLOCKED BODY — VERBS &gt; QUILT &gt; CONFORMING MESH\n` +
  `CELLS ${body.cells}   TRIANGLES ${body.triangles}   CLOSED MESH ${String(body.closed).toUpperCase()}`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0c);

const w = window.innerWidth, h = window.innerHeight;
const camera = new THREE.PerspectiveCamera(32, w / h, 10, 60000);
camera.up.set(0, 0, 1);
camera.position.set(-3600, -5600, 2900);
camera.lookAt(2100, 0, 550);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(w, h);
renderer.setPixelRatio(1);
document.body.appendChild(renderer.domElement);

// grid — hairline, mm ground plane at Z=0
const grid = new THREE.GridHelper(12000, 60, 0x26262b, 0x1a1a1f);
grid.rotation.x = Math.PI / 2;
grid.position.set(2100, 0, 0);
scene.add(grid);

const geo = new THREE.BufferGeometry();
geo.setAttribute("position", new THREE.Float32BufferAttribute(Float32Array.from(body.positions), 3));
geo.setIndex(new THREE.Uint32BufferAttribute(Uint32Array.from(body.indices), 1));
geo.computeVertexNormals();

const mat = new THREE.MeshStandardMaterial({
  color: 0xd8d8d2, metalness: 0.05, roughness: 0.65, flatShading: true,
});
const mesh = new THREE.Mesh(geo, mat);
scene.add(mesh);

const edges = new THREE.LineSegments(
  new THREE.EdgesGeometry(geo, 30),
  new THREE.LineBasicMaterial({ color: 0x55555c }),
);
scene.add(edges);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(-4000, -6000, 7000);
scene.add(key);
const rim = new THREE.DirectionalLight(0x8899ff, 0.5);
rim.position.set(6000, 4000, 2000);
scene.add(rim);

renderer.render(scene, camera);
document.title = "ready";
