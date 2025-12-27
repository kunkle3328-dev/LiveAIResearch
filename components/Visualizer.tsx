
import React, { useRef, useEffect } from 'react';

interface VisualizerProps {
  volume: number; // 0 to 1
  isActive: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ volume, isActive }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let phase = 0;
    
    // Configuration for the "Living Wave" look
    const waves = [
      { color: 'rgba(6, 182, 212, 0.8)', speed: 0.02, amplitude: 0.5, frequency: 1.0 }, // Cyan
      { color: 'rgba(99, 102, 241, 0.6)', speed: 0.03, amplitude: 0.7, frequency: 0.8 }, // Indigo
      { color: 'rgba(236, 72, 153, 0.4)', speed: 0.015, amplitude: 0.4, frequency: 1.2 }, // Pink
      { color: 'rgba(255, 255, 255, 0.9)', speed: 0.04, amplitude: 0.2, frequency: 2.0 }, // Core White
    ];

    const render = () => {
      // Clear canvas completely for transparency (No gray background)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      // Dampen volume jitter and set floor
      const targetVolume = isActive ? Math.max(volume, 0.02) : 0.01;
      
      // Global phase progression
      phase += 0.05;

      // Draw mirrored symmetrical waves
      waves.forEach((wave, i) => {
          ctx.beginPath();
          ctx.strokeStyle = wave.color;
          // Thicker lines for active state
          ctx.lineWidth = isActive ? 3 : 1.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';

          // Glow effect
          if (isActive) {
            ctx.shadowBlur = 20;
            ctx.shadowColor = wave.color;
          } else {
            ctx.shadowBlur = 0;
          }

          // Draw the wave
          for (let x = 0; x <= width; x += 5) {
              const xNorm = (x / width) * 2 - 1; // -1 to 1
              
              // Hanning window function (tapers edges to 0)
              const envelope = Math.pow(1 - Math.pow(xNorm, 2), 2);
              
              const wavePhase = phase * wave.speed * (i % 2 === 0 ? 1 : -1); // Alternate direction
              const sine = Math.sin((x * 0.01 * wave.frequency) + wavePhase);
              
              const yOffset = sine * (height * 0.4) * wave.amplitude * targetVolume * envelope;
              
              // Modulation for "organic" feel
              const mod = Math.cos((x * 0.005) - phase * 0.5) * 0.2;
              
              const y = centerY + yOffset + (mod * height * 0.1);

              if (x === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          ctx.stroke();
      });

      // Central "Core" line for stability when idle
      if (!isActive) {
         ctx.beginPath();
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
         ctx.lineWidth = 1;
         ctx.moveTo(0, centerY);
         ctx.lineTo(width, centerY);
         ctx.stroke();
      }

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationId);
  }, [volume, isActive]);

  return (
    <div className="absolute inset-0 w-full h-full flex items-center justify-center pointer-events-none">
        <canvas 
            ref={canvasRef} 
            width={1200} 
            height={600}
            className="w-full h-full object-cover"
        />
    </div>
  );
};
