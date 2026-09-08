'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type Garment = { instanceId: string; category: '上衣' | '下身' | '鞋子' | '配飾'; src: string; scale: number; rotation: number; z: number };

export function Avatar3D({ gender, angle, garments }: { gender: 'female' | 'male'; angle: number; garments: Garment[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<THREE.Group | null>(null);
  const angleRef = useRef(angle);

  useEffect(() => { angleRef.current = angle; if (avatarRef.current) avatarRef.current.rotation.y = THREE.MathUtils.degToRad(angle); }, [angle]);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, .1, 100); camera.position.set(0, .15, 8); camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5d5a50, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 3.4); key.position.set(4, 6, 5); key.castShadow = true; scene.add(key);
    const rim = new THREE.DirectionalLight(0x8aa3ff, 1.7); rim.position.set(-4, 2, -3); scene.add(rim);
    const avatar = new THREE.Group(); avatar.rotation.y = THREE.MathUtils.degToRad(angleRef.current); avatarRef.current = avatar; scene.add(avatar);
    const skin = new THREE.MeshPhysicalMaterial({ color: gender === 'female' ? 0xeeeae2 : 0xe7e8e5, roughness: .48, metalness: .02, clearcoat: .25 });
    const add = (geometry: THREE.BufferGeometry, position: [number, number, number], scale: [number, number, number], rotation: [number, number, number] = [0,0,0]) => { const mesh = new THREE.Mesh(geometry, skin); mesh.position.set(...position); mesh.scale.set(...scale); mesh.rotation.set(...rotation); mesh.castShadow = true; mesh.receiveShadow = true; avatar.add(mesh); return mesh; };
    const shoulder = gender === 'male' ? 1.08 : .91; const hip = gender === 'male' ? .82 : .98;
    add(new THREE.SphereGeometry(1, 48, 32), [0, 2.25, 0], [.42, .54, .43]);
    add(new THREE.CylinderGeometry(.18, .22, .38, 24), [0, 1.82, 0], [1,1,1]);
    add(new THREE.CapsuleGeometry(.72, 1.02, 12, 28), [0, .98, 0], [shoulder, 1, .58]);
    add(new THREE.SphereGeometry(1, 40, 24), [0, -.08, 0], [hip, .56, .58]);
    add(new THREE.CapsuleGeometry(.18, 1.28, 10, 20), [-.82 * shoulder, .75, 0], [1,1,1], [0,0,-.12]);
    add(new THREE.CapsuleGeometry(.18, 1.28, 10, 20), [.82 * shoulder, .75, 0], [1,1,1], [0,0,.12]);
    add(new THREE.CapsuleGeometry(.25, 1.72, 10, 24), [-.4 * hip, -1.25, 0], [1,1,1], [0,0,-.025]);
    add(new THREE.CapsuleGeometry(.25, 1.72, 10, 24), [.4 * hip, -1.25, 0], [1,1,1], [0,0,.025]);
    add(new THREE.SphereGeometry(.36, 24, 16), [-.4 * hip, -2.43, .16], [1.05,.38,1.85]);
    add(new THREE.SphereGeometry(.36, 24, 16), [.4 * hip, -2.43, .16], [1.05,.38,1.85]);

    const loader = new THREE.TextureLoader();
    [...garments].sort((a,b) => a.z-b.z).forEach((item, index) => {
      const fit = item.category === '上衣' ? { y:.88, w:1.75, h:1.68, z:.67 } : item.category === '下身' ? { y:-.55, w:1.6, h:1.95, z:.62 } : item.category === '鞋子' ? { y:-2.34, w:1.72, h:.72, z:.66 } : { y:1.95, w:1.2, h:1.0, z:.62 };
      const texture = loader.load(item.src); texture.colorSpace = THREE.SRGBColorSpace;
      const geometry = new THREE.PlaneGeometry(fit.w, fit.h, 18, 18); const positions = geometry.attributes.position;
      for (let i=0;i<positions.count;i++) { const x = positions.getX(i); positions.setZ(i, .1 - Math.pow(Math.abs(x)/(fit.w/2), 1.7) * .19); }
      positions.needsUpdate = true; geometry.computeVertexNormals();
      const material = new THREE.MeshBasicMaterial({ map:texture, transparent:true, side:THREE.DoubleSide, depthWrite:false, alphaTest:.025 });
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(0, fit.y, fit.z + index*.012); mesh.scale.setScalar(Math.max(.45, item.scale)); mesh.rotation.z = THREE.MathUtils.degToRad(item.rotation); mesh.renderOrder = 10 + index; avatar.add(mesh);
    });

    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.1, 64), new THREE.MeshStandardMaterial({ color:0xdad6cc, roughness:1, transparent:true, opacity:.7 })); floor.rotation.x = -Math.PI/2; floor.position.y = -2.77; floor.receiveShadow = true; scene.add(floor);
    const resize = () => { const { clientWidth:w, clientHeight:h } = host; renderer.setSize(w,h,false); camera.aspect = w/h; camera.updateProjectionMatrix(); }; resize(); const observer = new ResizeObserver(resize); observer.observe(host);
    let frame = 0; const render = () => { frame=requestAnimationFrame(render); renderer.render(scene,camera); }; render();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); host.removeChild(renderer.domElement); scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => { if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose(); material.dispose(); }); } }); renderer.dispose(); avatarRef.current = null; };
  }, [gender, garments]);

  return <div ref={hostRef} className="avatar-3d" aria-label={`${gender === 'female' ? '女生' : '男生'} 3D 試穿模特兒`} />;
}
