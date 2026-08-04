import * as THREE from 'three';

/**
 * A wheel with a real tire section and a real rim.
 *
 * A flat cylinder is the single loudest "this is a toy" cue in an automotive
 * render — a real tire has a crowned tread that rolls into a sidewall, and a
 * rim face set well inboard of the tread. Lathing the profile costs nothing
 * and buys most of the believability of the whole picture.
 *
 * Built in the lathe's own frame (axis along Y); the caller rotates it onto
 * the car's lateral axis.
 */
export function buildWheel(radius: number, section: number): THREE.Group {
  const g = new THREE.Group();
  const halfW = section / 2;
  // Sidewall bulge and a crowned tread, in profile: (radial, axial).
  const rimR = radius * 0.66;
  const profile: THREE.Vector2[] = [
    new THREE.Vector2(rimR * 0.98, -halfW * 0.82),
    new THREE.Vector2(radius * 0.84, -halfW * 0.99),
    new THREE.Vector2(radius * 0.97, -halfW * 0.86),
    new THREE.Vector2(radius, -halfW * 0.5),
    new THREE.Vector2(radius, halfW * 0.5),
    new THREE.Vector2(radius * 0.97, halfW * 0.86),
    new THREE.Vector2(radius * 0.84, halfW * 0.99),
    new THREE.Vector2(rimR * 0.98, halfW * 0.82),
  ];
  const tire = new THREE.Mesh(
    new THREE.LatheGeometry(profile, 48),
    new THREE.MeshPhysicalMaterial({ color: 0x121316, roughness: 0.88, metalness: 0.02 }),
  );
  tire.castShadow = true;
  g.add(tire);

  const rimMat = new THREE.MeshPhysicalMaterial({
    color: 0xb8bcc4, roughness: 0.24, metalness: 0.95, clearcoat: 0.4,
  });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rimR, rimR, halfW * 1.7, 40), rimMat);
  barrel.castShadow = true;
  g.add(barrel);

  // Face dished inboard, the way a wheel actually sits in its arch.
  const face = new THREE.Mesh(new THREE.CircleGeometry(rimR * 0.99, 40), rimMat);
  face.rotation.x = -Math.PI / 2;
  face.position.y = halfW * 0.62;
  g.add(face);

  // Spokes, five, because a blank disc reads as a hubcap on a rental.
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = new THREE.Mesh(
      new THREE.BoxGeometry(rimR * 0.9, halfW * 0.18, rimR * 0.2),
      rimMat,
    );
    spoke.position.set(Math.cos(a) * rimR * 0.45, halfW * 0.5, Math.sin(a) * rimR * 0.45);
    spoke.rotation.y = -a;
    g.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.22, rimR * 0.22, halfW * 0.5, 20), rimMat);
  hub.position.y = halfW * 0.5;
  g.add(hub);
  return g;
}
