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
  background: linear-gradient(to bottom, #87CEEB, #00BFFF); /* 渐变天蓝色底色 */
`;

const CanvasWrap = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
`;

const Content = styled.div`
  position: relative;
  z-index: 1;
  min-height: 100vh;
`;

export interface WaterBackgroundRef {
  triggerRipple: (count: number) => void;
}

interface Props {
  children: React.ReactNode;
}

// 生成泳池底部渐变纹理
function generatePoolBottomTexture(size = 512): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // 径向渐变模拟深浅
  const grad = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size);
  grad.addColorStop(0, '#4fc3f7'); // 浅天蓝
  grad.addColorStop(1, '#0288d1'); // 深蓝
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  
  // 简单的焦散网格模拟 (Caustics pattern simulation)
  ctx.globalCompositeOperation = 'overlay';
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  for(let i=0; i<size; i+=40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + Math.random()*20, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i + Math.random()*20);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
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
    // 移除深色雾，改用清澈的淡蓝色雾或无雾，增强通透感
    // scene.fog = new THREE.FogExp2('#083044', 0.0025); 

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 20000);
    camera.position.set(-30, 35, 60); 

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // 开启透明背景，让 CSS 渐变透出来 (或者用 Scene background)
    renderer.setClearColor(0x000000, 0); 
    mountEl.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 环境光增强
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(50, 100, -20);
    scene.add(dirLight);

    // 泳池底部
    const poolTexture = generatePoolBottomTexture();
    const waterNormals = generateWaterNormals();
    const bottomGeo = new THREE.PlaneGeometry(2000, 2000);
    const bottomMat = new THREE.MeshBasicMaterial({ map: poolTexture }); // 使用 Basic 材质保持鲜艳
    const bottom = new THREE.Mesh(bottomGeo, bottomMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = -15; // 稍微深一点
    scene.add(bottom);

    // 水面
    const waterGeometry = new THREE.PlaneGeometry(1000, 1000);
    const water = new Water(waterGeometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals,
      sunDirection: dirLight.position.clone().normalize(),
      sunColor: 0xffffff,
      waterColor: 0x00ffff, // 青色/天蓝色
      distortionScale: 1.5, // 稍微平静一点
      fog: false
    });
    water.rotation.x = -Math.PI / 2;
    // 调整透明度混合
    water.material.transparent = true;
    water.material.opacity = 0.6;
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
    // 气泡粒子 (改为白色/透明，模拟泳池气泡)
    const particleCount = 2000;
    const positions = new Float32Array(particleCount * 3);
    for (let i=0;i<particleCount;i++) {
      positions[i*3] = (Math.random()-0.5)*800;
      positions[i*3+1] = -2 - Math.random()*20; 
      positions[i*3+2] = (Math.random()-0.5)*800;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions,3));
    const particleMat = new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: true, transparent: true, opacity:0.3, depthWrite:false });
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
