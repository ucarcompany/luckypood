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
  pointer-events: none; /* 让鼠标事件穿透到 Canvas */
  & > * {
    pointer-events: auto; /* 恢复子元素交互 */
  }
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
// 生成圆形粒子纹理
function generateCircleTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
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
    
    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 20000);
    camera.position.set(-30, 35, 60); 

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // 开启透明背景，让 CSS 渐变透出来
    renderer.setClearColor(0x000000, 0); 
    mountEl.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 环境光增强
    scene.add(new THREE.AmbientLight(0xffffff, 1.0));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(50, 100, -20);
    scene.add(dirLight);

    // 水面
    const waterGeometry = new THREE.PlaneGeometry(2000, 2000);
    const water = new Water(waterGeometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: generateWaterNormals(),
      sunDirection: dirLight.position.clone().normalize(),
      sunColor: 0xffffff,
      waterColor: 0xccf0ff, // 非常淡的青白色
      distortionScale: 8.0, // 增加扭曲度，打破直线感
      fog: false,
      alpha: 0.3 // 更透明
    });
    water.rotation.x = -Math.PI / 2;
    water.material.transparent = true;
    water.material.opacity = 0.3; // 整体透明度
    water.material.side = THREE.DoubleSide;
    scene.add(water);
    waterObjRef.current = water;

    // 交互式涟漪 (使用 expanding rings 模拟)
    const ripples: THREE.Mesh[] = [];
    const rippleGeo = new THREE.RingGeometry(0.1, 0.2, 64); // 增加分段数，更圆滑
    const rippleMat = new THREE.MeshBasicMaterial({ 
      color: 0xffffff, 
      transparent: true, 
      opacity: 0.6, 
      side: THREE.DoubleSide 
    });

    const spawnRipple = (x: number, z: number) => {
      const mesh = new THREE.Mesh(rippleGeo, rippleMat.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.05, z); // 略高于水面
      mesh.userData = { age: 0, maxAge: 2.0 }; // 2秒寿命
      scene.add(mesh);
      ripples.push(mesh);
    };

    // Raycaster for interaction
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // 水平面 y=0

    const handleInput = (clientX: number, clientY: number) => {
      mouse.x = (clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(clientY / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const target = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, target)) {
        spawnRipple(target.x, target.z);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      // 限制频率
      if (Math.random() > 0.8) handleInput(e.clientX, e.clientY);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0 && Math.random() > 0.8) {
        handleInput(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove);

    // 控制器 (仅用于调试，可禁用交互)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.enableRotate = false;

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // 动画循环
    const clock = new THREE.Clock();
    // 气泡粒子
    const particleCount = 1000;
    const positions = new Float32Array(particleCount * 3);
    for (let i=0;i<particleCount;i++) {
      positions[i*3] = (Math.random()-0.5)*800;
      positions[i*3+1] = -2 - Math.random()*20; 
      positions[i*3+2] = (Math.random()-0.5)*800;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions,3));
    
    // 使用圆形纹理
    const particleTexture = generateCircleTexture();
    const particleMat = new THREE.PointsMaterial({ 
      color: 0xffffff, 
      size: 2, 
      map: particleTexture,
      transparent: true, 
      opacity: 0.4,
      alphaTest: 0.1 // 去除透明边缘
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    const animate = () => {
      const delta = clock.getDelta();
      if (waterObjRef.current) {
        waterObjRef.current.material.uniforms.time.value += delta;
      }
      
      // 更新涟漪
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.userData.age += delta;
        const scale = 1 + r.userData.age * 15; // 扩散速度
        r.scale.set(scale, scale, 1);
        (r.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - r.userData.age / r.userData.maxAge);
        
        if (r.userData.age >= r.userData.maxAge) {
          scene.remove(r);
          ripples.splice(i, 1);
        }
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
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
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
