
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

    const render = () => {
      // 1. Fully clear the canvas (Transparent background)
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      // Dampen volume jitter and set floor
      const targetVolume = isActive ? Math.max(volume, 0.05) : 0.02;
      
      // Global phase progression
      phase += 0.08;

      // Create Gradient
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, 'rgba(6, 182, 212, 0)'); // Fade in cyan
      gradient.addColorStop(0.2, 'rgba(6, 182, 212, 0.8)'); // Cyan
      gradient.addColorStop(0.5, 'rgba(99, 102, 241, 1)'); // Indigo
      gradient.addColorStop(0.8, 'rgba(236, 72, 153, 0.8)'); // Pink
      gradient.addColorStop(1, 'rgba(236, 72, 153, 0)'); // Fade out pink

      // Draw Main Wave
      ctx.beginPath();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = isActive ? 4 : 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (isActive) {
          ctx.shadowBlur = 15;
          ctx.shadowColor = 'rgba(99, 102, 241, 0.5)';
      } else {
          ctx.shadowBlur = 0;
      }

      for (let x = 0; x <= width; x += 4) {
          const xNorm = (x / width) * 2 - 1; // -1 to 1
          
          // Hanning window function for tapering edges
          const envelope = Math.pow(1 - Math.pow(xNorm, 2), 2);
          
          // Composite wave for organic feel
          const y1 = Math.sin((x * 0.01) + phase) * 0.5;
          const y2 = Math.sin((x * 0.02) - phase * 1.5) * 0.3;
          const y3 = Math.sin((x * 0.005) + phase * 0.5) * 0.2;
          
          const combinedSine = y1 + y2 + y3;
          
          const yOffset = combinedSine * (height * 0.4) * targetVolume * envelope;
          
          const y = centerY + yOffset;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw Secondary Echo Wave (Thinner, lower opacity)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      
      for (let x = 0; x <= width; x += 8) {
          const xNorm = (x / width) * 2 - 1;
          const envelope = Math.pow(1 - Math.pow(xNorm, 2), 2);
          
          const y1 = Math.sin((x * 0.01) + phase - 0.5) * 0.5;
          const yOffset = y1 * (height * 0.4) * targetVolume * envelope;
          
          const y = centerY + yOffset;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Central Baseline when idle
      if (!isActive) {
         ctx.beginPath();
         ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
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
