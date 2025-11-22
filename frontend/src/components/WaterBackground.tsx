import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';

const Container = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: -1;
  overflow: hidden;
  background: #006994;
`;

const Canvas = styled.canvas`
  width: 100%;
  height: 100%;
  display: block;
`;

const Content = styled.div`
  position: relative;
  z-index: 1;
  height: 100%;
  overflow-y: auto;
`;

export interface WaterBackgroundRef {
  triggerRipple: (count: number) => void;
}

interface Props {
  children: React.ReactNode;
}

const WaterBackground = React.forwardRef<WaterBackgroundRef, Props>(({ children }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timeRef = useRef<number>(0);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) return;

    // Resize canvas
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener('resize', resize);
    resize();

    // Shaders
    const vsSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;
      void main() {
        gl_Position = vec4(a_position, 0, 1);
        v_texCoord = a_texCoord;
      }
    `;

    const fsSource = `
      precision mediump float;
      uniform float u_time;
      varying vec2 v_texCoord;

      void main() {
        vec2 uv = v_texCoord * 6.0; // Scale up for more ripples
        float time = u_time * 0.5;
        
        vec2 p = uv;
        float c = 1.0;
        float inten = 0.05;

        for (int n = 0; n < 4; n++) {
          float t = time * (1.0 - (3.0 / float(n+1)));
          p = p + vec2(cos(t - p.x) + sin(t + p.y), sin(t - p.y) + cos(t + p.x));
          c += 1.0/length(vec2(p.x / (sin(p.x+t)/inten), p.y / (cos(p.y+t)/inten)));
        }
        c /= 4.0;
        c = 1.5 - sqrt(c);
        
        vec3 color = vec3(0.0, 0.3, 0.5) + vec3(c*c*c*c) * 0.6; // Deep blue with bright caustics
        gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
      }
    `;

    // Compile shaders
    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertexShader = createShader(gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Buffers
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]), gl.STATIC_DRAW);

    const texCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 1,
      1, 1,
      0, 0,
      0, 0,
      1, 1,
      1, 0,
    ]), gl.STATIC_DRAW);

    // Attributes & Uniforms
    const positionLoc = gl.getAttribLocation(program, 'a_position');
    const texCoordLoc = gl.getAttribLocation(program, 'a_texCoord');
    const timeLoc = gl.getUniformLocation(program, 'u_time');

    gl.enableVertexAttribArray(positionLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.enableVertexAttribArray(texCoordLoc);
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

    // Animation Loop
    const render = (now: number) => {
      timeRef.current = now * 0.001;
      gl.uniform1f(timeLoc, timeRef.current);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationRef.current = requestAnimationFrame(render);
    };
    animationRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // Expose triggerRipple (currently no-op in this shader version, but keeps interface)
  React.useImperativeHandle(ref, () => ({
    triggerRipple: () => {}
  }));

  return (
    <Container>
      <Canvas ref={canvasRef} />
      <Content>{children}</Content>
    </Container>
  );
});

export default WaterBackground;
