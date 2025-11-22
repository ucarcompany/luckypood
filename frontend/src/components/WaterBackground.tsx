import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const Container = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: -1;
  overflow: hidden;
  background: #021f2a; /* 深海背景过渡 */
`;

const CanvasWrap = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none; /* 允许上层交互 */
`;

const Content = styled.div`
  position: relative;
  z-index: 1;
  min-height: 100vh;
  backdrop-filter: none;
`;

export interface WaterBackgroundRef {
  triggerRipple: (count: number) => void;
}

interface Props {
  children: React.ReactNode;
}

// 程序化生成沙地纹理 (避免直接提交外部图片，用户可换成提供图片)
function generateSandTexture(size = 512): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // 基础底色
  ctx.fillStyle = '#eadfc7';
  ctx.fillRect(0, 0, size, size);
  // 噪声颗粒
  for (let i = 0; i < size * 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const g = 200 + Math.floor(Math.random() * 40);
    ctx.fillStyle = `rgba(${g},${190 + Math.random()*30},${150 + Math.random()*20},${Math.random()*0.3})`;
    ctx.fillRect(x, y, 1.2, 1.2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 8);
  return texture;
}

// 简单 Perlin 噪声，用于水面法线贴图生成
function perlin(x: number, y: number): number {
  function fade(t: number) { return t*t*t*(t*(t*6-15)+10) }
  function lerp(a: number, b: number, t: number) { return a + (b-a)*t }
  function grad(hash: number, x: number, y: number) {
    switch(hash & 3) { case 0: return  x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; default: return 0; }
  }
  const X = Math.floor(x) & 255; const Y = Math.floor(y) & 255;
  x -= Math.floor(x); y -= Math.floor(y);
  const u = fade(x); const v = fade(y);
  const p: number[] = []; for (let i=0;i<512;i++) p[i] = perm[i & 255];
  const aa = p[X     + p[Y    ]];
  const ab = p[X     + p[Y + 1]];
  const ba = p[X + 1 + p[Y    ]];
  const bb = p[X + 1 + p[Y + 1]];
  return lerp(lerp(grad(aa,x,y), grad(ba,x-1,y), u), lerp(grad(ab,x,y-1), grad(bb,x-1,y-1), u), v);
}
const perm = Array.from({length:256},()=>Math.floor(Math.random()*256));

function generateWaterNormals(size=256): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(size, size);
  for (let y=0;y<size;y++) {
    for (let x=0;x<size;x++) {
      const nx = perlin(x/32, y/32);
      const ny = perlin(x/32+100, y/32+100);
      const nz = 1.0;
      // Normalize rough vector
      const len = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1;
      const r = ((nx/len)+1)*127;
      const g = ((ny/len)+1)*127;
      const b = ((nz/len)+1)*127;
      const i = (y*size + x)*4;
      imgData.data[i] = r;
      imgData.data[i+1] = g;
      imgData.data[i+2] = b;
      imgData.data[i+3] = 255;
    }
  }
  ctx.putImageData(imgData,0,0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4,4);
  return tex;
}

const WaterBackground = React.forwardRef<WaterBackgroundRef, Props>(({ children }, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const waterObjRef = useRef<Water>();
  const rippleQueueRef = useRef<number>(0);
  const rendererRef = useRef<THREE.WebGLRenderer>();
  const animationRef = useRef<number>();

  useEffect(() => {
    const mountEl = mountRef.current;
    if (!mountEl) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2('#083044', 0.0025);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 20000);
    camera.position.set(-30, 35, 60); // 俯视角度带透视感

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mountEl.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 环境光与定向光模拟水下氛围
    scene.add(new THREE.AmbientLight(0x88bbee, 0.6));
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(50, 100, -20);
    scene.add(dirLight);

    // 沙地平面
    const sandTexture = generateSandTexture();
    const waterNormals = generateWaterNormals();
    const sandGeo = new THREE.PlaneGeometry(2000, 2000, 10, 10);
    const sandMat = new THREE.MeshStandardMaterial({ map: sandTexture, roughness: 1, metalness: 0 });
    const sand = new THREE.Mesh(sandGeo, sandMat);
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = -8; // 水下偏移
    scene.add(sand);

    // 水面 (使用 three/examples Water)
    const waterGeometry = new THREE.PlaneGeometry(1000, 1000);
    const water = new Water(waterGeometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals,
      sunDirection: dirLight.position.clone().normalize(),
      sunColor: 0xffffff,
      waterColor: 0x0a6aa8,
      distortionScale: 3.2,
      fog: true
    });
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
    waterObjRef.current = water;

    // 控制器 (仅用于调试，可禁用交互)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableRotate = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // 动画循环
    const clock = new THREE.Clock();
    // 体积雾模拟: 使用粒子点云在水面下方缓慢漂浮
    const particleCount = 4000;
    const positions = new Float32Array(particleCount * 3);
    for (let i=0;i<particleCount;i++) {
      positions[i*3] = (Math.random()-0.5)*800;
      positions[i*3+1] = -5 - Math.random()*30; // below water surface
      positions[i*3+2] = (Math.random()-0.5)*800;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions,3));
    const particleMat = new THREE.PointsMaterial({ color: 0x0b4c65, size: 4, sizeAttenuation: true, transparent: true, opacity:0.08, depthWrite:false });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    const animate = () => {
      const delta = clock.getDelta();
      if (waterObjRef.current) {
        // 模拟涟漪队列: distortionScale 轻微波动
        if (rippleQueueRef.current > 0) {
          waterObjRef.current.material.uniforms.distortionScale.value = 3.2 + Math.sin(Date.now()*0.02)*0.8;
          rippleQueueRef.current -= delta;
        } else {
          waterObjRef.current.material.uniforms.distortionScale.value = 3.2;
        }
        waterObjRef.current.material.uniforms.time.value += delta;
      }
      // 粒子缓慢上升漂浮
      const arr = particleGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i=0;i<particleCount;i++) {
        let y = arr.getY(i) + delta * 1.5 * (0.3 + Math.random()*0.7);
        if (y > -4) y = -30 - Math.random()*10; // reset
        arr.setY(i, y);
      }
      arr.needsUpdate = true;
      controls.update();
      renderer.render(scene, camera);
      animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', onResize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      controls.dispose();
      renderer.dispose();
      mountEl.removeChild(renderer.domElement);
    };
  }, []);

  React.useImperativeHandle(ref, () => ({
    triggerRipple: (count: number) => {
      rippleQueueRef.current = Math.min(3, rippleQueueRef.current + count * 0.3);
    }
  }));

  return (
    <Container>
      <CanvasWrap ref={mountRef} />
      <Content>{children}</Content>
    </Container>
  );
});

export default WaterBackground;
