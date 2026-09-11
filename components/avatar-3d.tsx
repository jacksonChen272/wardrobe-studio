'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

type Garment = { instanceId:string; category:'上衣'|'下身'|'鞋子'|'配飾'; src:string; scale:number; rotation:number; z:number };

export function Avatar3D({ gender, angle, zoom, garments }:{ gender:'female'|'male'; angle:number; zoom:number; garments:Garment[] }) {
  const hostRef=useRef<HTMLDivElement>(null); const avatarRef=useRef<THREE.Group|null>(null); const cameraRef=useRef<THREE.PerspectiveCamera|null>(null); const angleRef=useRef(angle); const zoomRef=useRef(zoom);
  useEffect(()=>{angleRef.current=angle;if(avatarRef.current)avatarRef.current.rotation.y=THREE.MathUtils.degToRad(angle)},[angle]);
  useEffect(()=>{zoomRef.current=zoom;if(cameraRef.current){cameraRef.current.position.z=8/zoom;cameraRef.current.updateProjectionMatrix()}},[zoom]);

  useEffect(()=>{
    const host=hostRef.current;if(!host)return;let disposed=false;
    const scene=new THREE.Scene();const camera=new THREE.PerspectiveCamera(28,1,.1,100);camera.position.set(0,.08,8/zoomRef.current);camera.lookAt(0,0,0);cameraRef.current=camera;
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff,0x6e6a61,2.8));const key=new THREE.DirectionalLight(0xffffff,4);key.position.set(4,6,5);key.castShadow=true;scene.add(key);const rim=new THREE.DirectionalLight(0x94aaff,1.5);rim.position.set(-4,3,-4);scene.add(rim);
    const avatar=new THREE.Group();avatar.rotation.y=THREE.MathUtils.degToRad(angleRef.current);avatarRef.current=avatar;scene.add(avatar);
    const whiteMaterial=new THREE.MeshPhysicalMaterial({color:0xf5f5f2,roughness:.28,metalness:0,clearcoat:.5,clearcoatRoughness:.32});
    new GLTFLoader().load(`./avatar-${gender}.glb`,(gltf)=>{
      if(disposed)return;const model=gltf.scene;model.traverse((object)=>{if(object instanceof THREE.Mesh||object instanceof THREE.SkinnedMesh){object.material=whiteMaterial;object.castShadow=true;object.receiveShadow=true}});
      const idle=gltf.animations.find((clip)=>/idle/i.test(clip.name))??gltf.animations[0];if(idle){const mixer=new THREE.AnimationMixer(model);mixer.clipAction(idle).play();mixer.setTime(0)}
      const box=new THREE.Box3().setFromObject(model);const size=box.getSize(new THREE.Vector3());const center=box.getCenter(new THREE.Vector3());const scale=5.3/size.y;model.scale.setScalar(scale);model.position.set(-center.x*scale,-center.y*scale,-center.z*scale);avatar.add(model);
    });

    const textureLoader=new THREE.TextureLoader();const shoulder=gender==='male'?1.06:.93;const hip=gender==='male'?.9:1.02;
    [...garments].sort((a,b)=>a.z-b.z).forEach((item,index)=>{
      const texture=textureLoader.load(item.src);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=THREE.ClampToEdgeWrapping;texture.wrapT=THREE.ClampToEdgeWrapping;
      const material=new THREE.MeshPhysicalMaterial({map:texture,transparent:true,side:THREE.DoubleSide,alphaTest:.045,roughness:.88,metalness:0,clearcoat:.02});
      const group=new THREE.Group();group.rotation.z=THREE.MathUtils.degToRad(item.rotation);group.renderOrder=20+index;
      const part=(geometry:THREE.BufferGeometry,position:[number,number,number],rotation:[number,number,number]=[0,0,0],scale:[number,number,number]=[1,1,1])=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.set(...rotation);mesh.scale.set(...scale);mesh.castShadow=true;mesh.renderOrder=20+index;group.add(mesh)};
      if(item.category==='上衣'){
        part(new THREE.CylinderGeometry(.7*shoulder,.54,1.5,48,6,false),[0,.82,0]);
        part(new THREE.CylinderGeometry(.23,.18,1.28,28,4,false),[-.77*shoulder,.62,0],[0,0,-.12]);part(new THREE.CylinderGeometry(.23,.18,1.28,28,4,false),[.77*shoulder,.62,0],[0,0,.12]);
        group.scale.setScalar(Math.max(.6,item.scale/.78));
      }else if(item.category==='下身'){
        part(new THREE.CylinderGeometry(.68*hip,.58*hip,.6,44,4,false),[0,-.32,0]);part(new THREE.CylinderGeometry(.34*hip,.23,1.85,32,5,false),[-.32*hip,-1.4,0],[0,0,-.018]);part(new THREE.CylinderGeometry(.34*hip,.23,1.85,32,5,false),[.32*hip,-1.4,0],[0,0,.018]);group.scale.setScalar(Math.max(.6,item.scale/.9));
      }else if(item.category==='鞋子'){
        part(new THREE.CapsuleGeometry(.25,.48,10,22),[-.31*hip,-2.5,.2],[Math.PI/2,0,0],[1,1,1.35]);part(new THREE.CapsuleGeometry(.25,.48,10,22),[.31*hip,-2.5,.2],[Math.PI/2,0,0],[1,1,1.35]);group.scale.setScalar(Math.max(.6,item.scale/.62));
      }else{part(new THREE.TorusGeometry(.38,.06,18,48),[0,1.72,.04],[Math.PI/2,0,0]);part(new THREE.PlaneGeometry(.9,.65,12,12),[0,2,.44]);group.scale.setScalar(Math.max(.6,item.scale/.55))}
      avatar.add(group);
    });
    const floor=new THREE.Mesh(new THREE.CircleGeometry(1.65,64),new THREE.MeshStandardMaterial({color:0xd6d3ca,roughness:1,transparent:true,opacity:.72}));floor.rotation.x=-Math.PI/2;floor.position.y=-2.67;floor.receiveShadow=true;scene.add(floor);
    const resize=()=>{const{clientWidth:w,clientHeight:h}=host;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()};resize();const observer=new ResizeObserver(resize);observer.observe(host);let frame=0;const render=()=>{frame=requestAnimationFrame(render);renderer.render(scene,camera)};render();
    return()=>{disposed=true;cancelAnimationFrame(frame);observer.disconnect();if(renderer.domElement.parentNode===host)host.removeChild(renderer.domElement);scene.traverse((object)=>{if(object instanceof THREE.Mesh){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];materials.forEach((material)=>{if('map'in material&&material.map instanceof THREE.Texture)material.map.dispose();material.dispose()})}});renderer.dispose();avatarRef.current=null;cameraRef.current=null};
  },[gender,garments]);
  return <div ref={hostRef} className="avatar-3d" aria-label={`${gender==='female'?'女裝':'男裝'}專業 3D 試穿人台`}/>;
}
