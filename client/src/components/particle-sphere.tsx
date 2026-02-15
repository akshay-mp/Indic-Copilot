import { useRef, useEffect, useCallback } from "react";

interface ParticleSphereProps {
  state: "idle" | "listening" | "userSpeaking" | "thinking" | "speaking";
  audioLevel?: number;
  size?: number;
  isDark?: boolean;
}

interface Electron {
  orbitRadius: number;
  orbitTilt: number;
  orbitRotation: number;
  speed: number;
  angle: number;
  size: number;
  trailLength: number;
}

export function ParticleSphere({ state, audioLevel = 0, size = 280, isDark = true }: ParticleSphereProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const electronsRef = useRef<Electron[]>([]);
  const animFrameRef = useRef<number>(0);
  const timeRef = useRef(0);

  const initElectrons = useCallback(() => {
    const electrons: Electron[] = [];
    const orbits = [
      { count: 3, radius: 0.55, tilt: 0.3, rotation: 0 },
      { count: 3, radius: 0.75, tilt: -0.5, rotation: Math.PI / 3 },
      { count: 2, radius: 0.92, tilt: 0.8, rotation: Math.PI / 6 },
    ];
    for (const orbit of orbits) {
      for (let i = 0; i < orbit.count; i++) {
        electrons.push({
          orbitRadius: orbit.radius,
          orbitTilt: orbit.tilt,
          orbitRotation: orbit.rotation,
          speed: 0.6 + Math.random() * 0.4,
          angle: (i / orbit.count) * Math.PI * 2 + Math.random() * 0.3,
          size: 2.5 + Math.random() * 1.5,
          trailLength: 12 + Math.floor(Math.random() * 8),
        });
      }
    }
    electronsRef.current = electrons;
  }, []);

  useEffect(() => {
    initElectrons();
  }, [initElectrons]);

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

      let speedMult = 1;
      let pulseAmount = 0;
      let nucleusColor: { r: number; g: number; b: number };
      let electronColor: { r: number; g: number; b: number };
      let orbitColor: { r: number; g: number; b: number; a: number };
      let glowIntensity = 0.06;
      let nucleusExpand = 0;

      if (isDark) {
        nucleusColor = { r: 160, g: 175, b: 200 };
        electronColor = { r: 180, g: 200, b: 230 };
        orbitColor = { r: 140, g: 160, b: 190, a: 0.08 };
      } else {
        nucleusColor = { r: 60, g: 75, b: 110 };
        electronColor = { r: 50, g: 70, b: 120 };
        orbitColor = { r: 80, g: 100, b: 140, a: 0.1 };
      }

      if (state === "idle") {
        speedMult = 0.6;
        pulseAmount = Math.sin(t * 0.8) * 0.02;
      } else if (state === "listening") {
        speedMult = 1;
        pulseAmount = Math.sin(t * 1.5) * 0.04;
        glowIntensity = 0.1;
        if (isDark) {
          nucleusColor = { r: 100, g: 200, b: 180 };
          electronColor = { r: 120, g: 220, b: 200 };
          orbitColor = { r: 80, g: 180, b: 160, a: 0.12 };
        } else {
          nucleusColor = { r: 20, g: 140, b: 120 };
          electronColor = { r: 15, g: 150, b: 130 };
          orbitColor = { r: 20, g: 140, b: 120, a: 0.14 };
        }
      } else if (state === "userSpeaking") {
        speedMult = 1.8 + audioLevel * 1.5;
        pulseAmount = Math.sin(t * 3) * 0.06 + audioLevel * 0.12;
        glowIntensity = 0.15 + audioLevel * 0.1;
        nucleusExpand = audioLevel * 0.15;
        if (isDark) {
          nucleusColor = { r: 80, g: 240, b: 170 };
          electronColor = { r: 100, g: 255, b: 190 };
          orbitColor = { r: 60, g: 220, b: 150, a: 0.18 };
        } else {
          nucleusColor = { r: 16, g: 160, b: 100 };
          electronColor = { r: 10, g: 170, b: 110 };
          orbitColor = { r: 16, g: 160, b: 100, a: 0.2 };
        }
      } else if (state === "thinking") {
        speedMult = 2.5;
        pulseAmount = Math.sin(t * 2) * 0.08;
        glowIntensity = 0.12;
        if (isDark) {
          nucleusColor = { r: 130, g: 150, b: 255 };
          electronColor = { r: 150, g: 170, b: 255 };
          orbitColor = { r: 110, g: 130, b: 240, a: 0.15 };
        } else {
          nucleusColor = { r: 60, g: 80, b: 200 };
          electronColor = { r: 50, g: 70, b: 210 };
          orbitColor = { r: 60, g: 80, b: 200, a: 0.16 };
        }
      } else if (state === "speaking") {
        speedMult = 1.2;
        pulseAmount = Math.sin(t * 1.8) * 0.05;
        glowIntensity = 0.1;
        nucleusExpand = Math.sin(t * 2.5) * 0.05;
        if (isDark) {
          nucleusColor = { r: 170, g: 140, b: 255 };
          electronColor = { r: 190, g: 160, b: 255 };
          orbitColor = { r: 160, g: 130, b: 240, a: 0.14 };
        } else {
          nucleusColor = { r: 110, g: 70, b: 200 };
          electronColor = { r: 120, g: 80, b: 210 };
          orbitColor = { r: 110, g: 70, b: 200, a: 0.16 };
        }
      }

      const glow = ctx.createRadialGradient(center, center, 0, center, center, baseRadius * 1.3);
      glow.addColorStop(0, `rgba(${nucleusColor.r}, ${nucleusColor.g}, ${nucleusColor.b}, ${glowIntensity})`);
      glow.addColorStop(0.6, `rgba(${nucleusColor.r}, ${nucleusColor.g}, ${nucleusColor.b}, ${glowIntensity * 0.3})`);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      const nucleusRadius = baseRadius * (0.12 + pulseAmount + nucleusExpand);
      const nucleusGrad = ctx.createRadialGradient(center, center, 0, center, center, nucleusRadius);
      nucleusGrad.addColorStop(0, `rgba(${nucleusColor.r}, ${nucleusColor.g}, ${nucleusColor.b}, 0.9)`);
      nucleusGrad.addColorStop(0.5, `rgba(${nucleusColor.r}, ${nucleusColor.g}, ${nucleusColor.b}, 0.4)`);
      nucleusGrad.addColorStop(1, `rgba(${nucleusColor.r}, ${nucleusColor.g}, ${nucleusColor.b}, 0)`);
      ctx.beginPath();
      ctx.arc(center, center, nucleusRadius, 0, Math.PI * 2);
      ctx.fillStyle = nucleusGrad;
      ctx.fill();

      const innerDots = 12;
      for (let i = 0; i < innerDots; i++) {
        const a = (i / innerDots) * Math.PI * 2 + t * 0.3;
        const r = nucleusRadius * (0.3 + Math.sin(t + i) * 0.2);
        const dx = center + Math.cos(a) * r;
        const dy = center + Math.sin(a) * r;
        ctx.beginPath();
        ctx.arc(dx, dy, 1.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${nucleusColor.r}, ${nucleusColor.g}, ${nucleusColor.b}, 0.6)`;
        ctx.fill();
      }

      const electrons = electronsRef.current;

      for (const e of electrons) {
        const orbitR = baseRadius * (e.orbitRadius + pulseAmount);

        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(e.orbitRotation);

        ctx.beginPath();
        ctx.ellipse(0, 0, orbitR, orbitR * Math.abs(Math.cos(e.orbitTilt)), 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${orbitColor.r}, ${orbitColor.g}, ${orbitColor.b}, ${orbitColor.a})`;
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();

        for (let trail = e.trailLength; trail >= 0; trail--) {
          const trailAngle = e.angle + t * speedMult * e.speed - trail * 0.06;
          const ex = Math.cos(trailAngle) * orbitR;
          const ey = Math.sin(trailAngle) * orbitR * Math.cos(e.orbitTilt);

          const rx = ex * Math.cos(e.orbitRotation) - ey * Math.sin(e.orbitRotation) + center;
          const ry = ex * Math.sin(e.orbitRotation) + ey * Math.cos(e.orbitRotation) + center;

          const trailOpacity = (1 - trail / e.trailLength) * 0.8;
          const trailSize = e.size * (1 - trail / e.trailLength * 0.6);

          if (trail === 0) {
            const electronGlow = ctx.createRadialGradient(rx, ry, 0, rx, ry, trailSize * 3);
            electronGlow.addColorStop(0, `rgba(${electronColor.r}, ${electronColor.g}, ${electronColor.b}, 0.3)`);
            electronGlow.addColorStop(1, "transparent");
            ctx.beginPath();
            ctx.arc(rx, ry, trailSize * 3, 0, Math.PI * 2);
            ctx.fillStyle = electronGlow;
            ctx.fill();
          }

          ctx.beginPath();
          ctx.arc(rx, ry, trailSize, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${electronColor.r}, ${electronColor.g}, ${electronColor.b}, ${trailOpacity})`;
          ctx.fill();
        }
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
