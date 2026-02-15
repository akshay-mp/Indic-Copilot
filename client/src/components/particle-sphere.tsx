import { useRef, useEffect, useCallback } from "react";

interface ParticleSphereProps {
  state: "idle" | "listening" | "userSpeaking" | "thinking" | "speaking";
  audioLevel?: number;
  size?: number;
  isDark?: boolean;
}

interface Particle {
  theta: number;
  phi: number;
  baseRadius: number;
  offset: number;
  speed: number;
  size: number;
  opacity: number;
}

export function ParticleSphere({ state, audioLevel = 0, size = 280, isDark = true }: ParticleSphereProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef(0);

  const initParticles = useCallback(() => {
    const particles: Particle[] = [];
    const count = 800;
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      particles.push({
        theta,
        phi,
        baseRadius: 0.85 + Math.random() * 0.3,
        offset: Math.random() * Math.PI * 2,
        speed: 0.2 + Math.random() * 0.8,
        size: 0.5 + Math.random() * 1.5,
        opacity: 0.3 + Math.random() * 0.7,
      });
    }
    particlesRef.current = particles;
  }, []);

  useEffect(() => {
    initParticles();
  }, [initParticles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const center = size / 2;
    const baseRadius = size * 0.35;

    const animate = () => {
      timeRef.current += 0.016;
      const t = timeRef.current;

      ctx.clearRect(0, 0, size, size);

      let rotSpeed = 0.15;
      let dispersion = 0;
      let pulseAmount = 0;
      let glowColor: string;
      let particleColor: { r: number; g: number; b: number };

      if (isDark) {
        glowColor = "rgba(140, 160, 180, 0.06)";
        particleColor = { r: 200, g: 210, b: 220 };
      } else {
        glowColor = "rgba(80, 100, 120, 0.08)";
        particleColor = { r: 60, g: 70, b: 90 };
      }

      if (state === "idle") {
        rotSpeed = 0.15;
        dispersion = 0;
        pulseAmount = Math.sin(t * 0.8) * 0.02;
      } else if (state === "listening") {
        rotSpeed = 0.3;
        dispersion = 0.03;
        pulseAmount = Math.sin(t * 1.5) * 0.04;
        if (isDark) {
          glowColor = "rgba(100, 200, 180, 0.08)";
          particleColor = { r: 140, g: 220, b: 200 };
        } else {
          glowColor = "rgba(20, 140, 120, 0.1)";
          particleColor = { r: 20, g: 150, b: 130 };
        }
      } else if (state === "userSpeaking") {
        rotSpeed = 0.6;
        dispersion = 0.08 + audioLevel * 0.15;
        pulseAmount = Math.sin(t * 3) * 0.06 + audioLevel * 0.1;
        if (isDark) {
          glowColor = "rgba(80, 220, 160, 0.12)";
          particleColor = { r: 100, g: 240, b: 180 };
        } else {
          glowColor = "rgba(16, 160, 100, 0.14)";
          particleColor = { r: 16, g: 160, b: 100 };
        }
      } else if (state === "thinking") {
        rotSpeed = 0.8;
        dispersion = 0.05;
        pulseAmount = Math.sin(t * 2) * 0.08;
        if (isDark) {
          glowColor = "rgba(120, 140, 255, 0.1)";
          particleColor = { r: 140, g: 160, b: 255 };
        } else {
          glowColor = "rgba(60, 80, 200, 0.12)";
          particleColor = { r: 60, g: 80, b: 200 };
        }
      } else if (state === "speaking") {
        rotSpeed = 0.4;
        dispersion = 0.06 + Math.sin(t * 2) * 0.04;
        pulseAmount = Math.sin(t * 1.8) * 0.05;
        if (isDark) {
          glowColor = "rgba(180, 140, 255, 0.1)";
          particleColor = { r: 180, g: 160, b: 255 };
        } else {
          glowColor = "rgba(120, 80, 200, 0.12)";
          particleColor = { r: 120, g: 80, b: 200 };
        }
      }

      const glow = ctx.createRadialGradient(center, center, 0, center, center, baseRadius * 1.2);
      glow.addColorStop(0, glowColor);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      const particles = particlesRef.current;
      const sorted: { x: number; y: number; z: number; s: number; o: number }[] = [];

      for (const p of particles) {
        const theta = p.theta + t * rotSpeed * p.speed;
        const phi = p.phi + Math.sin(t * p.speed + p.offset) * dispersion;

        const r = baseRadius * (p.baseRadius + pulseAmount * Math.sin(t * 2 + p.offset));

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);

        const depthFactor = (z + baseRadius) / (2 * baseRadius);

        sorted.push({
          x: center + x,
          y: center + y * 0.85,
          z,
          s: p.size * (0.4 + depthFactor * 0.8),
          o: p.opacity * (0.15 + depthFactor * 0.85),
        });
      }

      sorted.sort((a, b) => a.z - b.z);

      for (const pt of sorted) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.s, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${particleColor.r}, ${particleColor.g}, ${particleColor.b}, ${pt.o})`;
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [state, audioLevel, size, isDark]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      data-testid="particle-sphere"
    />
  );
}
