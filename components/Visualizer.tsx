
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

    // Helper to get CSS variable color
    const getVarColor = (name: string) => {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    };

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

      // Create Gradient using Theme Variables
      // We grab the variable values on every frame to support live theme switching
      const accentColor = getVarColor('--color-accent');
      // Simple parse to add transparency if it's hex, but assuming hex for simplicity of logic or we use the var directly if canvas supports it (it does usually for fill styles but not rgba manipulation easily). 
      // For robustness with the variables defined in index.html (which are hex or rgba), we will just use the accent color directly for the main stroke.
      
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, 'rgba(0,0,0,0)'); 
      gradient.addColorStop(0.2, accentColor); 
      gradient.addColorStop(0.5, accentColor);
      gradient.addColorStop(0.8, accentColor); 
      gradient.addColorStop(1, 'rgba(0,0,0,0)');

      // Draw Main Wave
      ctx.beginPath();
      ctx.strokeStyle = gradient;
      ctx.lineWidth = isActive ? 4 : 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      if (isActive) {
          ctx.shadowBlur = 15;
          ctx.shadowColor = accentColor;
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
      ctx.strokeStyle = `rgba(255, 255, 255, 0.2)`;
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
