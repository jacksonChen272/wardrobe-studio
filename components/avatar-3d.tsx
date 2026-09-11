'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

type Garment = { instanceId: string; category: '上衣' | '下身' | '鞋子' | '配飾'; src: string; scale: number; rotation: number; z: number };

export function Avatar3D({ gender, angle, zoom, garments }: { gender: 'female' | 'male'; angle: number; zoom: number; garments: Garment[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const angleRef = useRef(angle);
  const zoomRef = useRef(zoom);

  useEffect(() => { angleRef.current = angle; if (avatarRef.current) avatarRef.current.rotation.y = THREE.MathUtils.degToRad(angle); }, [angle]);
  useEffect(() => { zoomRef.current = zoom; if (cameraRef.current) { cameraRef.current.position.z = 8 / zoom; cameraRef.current.updateProjectionMatrix(); } }, [zoom]);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(28, 1, .1, 100); camera.position.set(0, .15, 8 / zoomRef.current); camera.lookAt(0, 0, 0); cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5d5a50, 2.5));
    const key = new THREE.DirectionalLight(0xffffff, 3.4); key.position.set(4, 6, 5); key.castShadow = true; scene.add(key);
    const rim = new THREE.DirectionalLight(0x8aa3ff, 1.7); rim.position.set(-4, 2, -3); scene.add(rim);
    const avatar = new THREE.Group(); avatar.rotation.y = THREE.MathUtils.degToRad(angleRef.current); avatarRef.current = avatar; scene.add(avatar);
    const skin = new THREE.MeshPhysicalMaterial({ color: 0xf2f2ef, roughness: .3, metalness: 0, clearcoat: .42, clearcoatRoughness:.36 });
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
      const texture = loader.load(item.src); texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshStandardMaterial({ map:texture, transparent:true, side:THREE.DoubleSide, alphaTest:.035, roughness:.82, metalness:0 });
      const garment = new THREE.Group(); garment.rotation.z=THREE.MathUtils.degToRad(item.rotation); garment.renderOrder=10+index;
      const garmentPart=(geometry:THREE.BufferGeometry,position:[number,number,number],rotation:[number,number,number]=[0,0,0])=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.set(...rotation);mesh.castShadow=true;mesh.renderOrder=10+index;garment.add(mesh);};
      if(item.category==='上衣'){
        garmentPart(new THREE.CylinderGeometry(.72*shoulder,.57,1.5,40,5,false),[0,.95,0]);
        garmentPart(new THREE.CylinderGeometry(.24,.2,1.2,24,3,false),[-.79*shoulder,.72,0],[0,0,-.13]);
        garmentPart(new THREE.CylinderGeometry(.24,.2,1.2,24,3,false),[.79*shoulder,.72,0],[0,0,.13]);
        garment.scale.setScalar(Math.max(.55,item.scale/.78));
      }else if(item.category==='下身'){
        garmentPart(new THREE.CylinderGeometry(.7*hip,.61*hip,.62,36,3,false),[0,-.25,0]);
        garmentPart(new THREE.CylinderGeometry(.36*hip,.27,1.75,28,4,false),[-.34*hip,-1.25,0],[0,0,-.02]);
        garmentPart(new THREE.CylinderGeometry(.36*hip,.27,1.75,28,4,false),[.34*hip,-1.25,0],[0,0,.02]);
        garment.scale.setScalar(Math.max(.55,item.scale/.9));
      }else if(item.category==='鞋子'){
        garmentPart(new THREE.SphereGeometry(.4,28,18),[-.4*hip,-2.43,.18]);garmentPart(new THREE.SphereGeometry(.4,28,18),[.4*hip,-2.43,.18]);garment.scale.setScalar(Math.max(.55,item.scale/.62));
      }else{
        garmentPart(new THREE.TorusGeometry(.43,.08,16,40),[0,1.79,.06],[Math.PI/2,0,0]);
        garmentPart(new THREE.PlaneGeometry(1.05,.78,12,12),[0,1.98,.47]);garment.scale.setScalar(Math.max(.55,item.scale/.55));
      }
      avatar.add(garment);
    });

    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.1, 64), new THREE.MeshStandardMaterial({ color:0xdad6cc, roughness:1, transparent:true, opacity:.7 })); floor.rotation.x = -Math.PI/2; floor.position.y = -2.77; floor.receiveShadow = true; scene.add(floor);
    const resize = () => { const { clientWidth:w, clientHeight:h } = host; renderer.setSize(w,h,false); camera.aspect = w/h; camera.updateProjectionMatrix(); }; resize(); const observer = new ResizeObserver(resize); observer.observe(host);
    let frame = 0; const render = () => { frame=requestAnimationFrame(render); renderer.render(scene,camera); }; render();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); host.removeChild(renderer.domElement); scene.traverse((object) => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => { if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose(); material.dispose(); }); } }); renderer.dispose(); avatarRef.current = null; cameraRef.current = null; };
  }, [gender, garments]);

  return <div ref={hostRef} className="avatar-3d" aria-label={`${gender === 'female' ? '女生' : '男生'} 3D 試穿模特兒`} />;
}
