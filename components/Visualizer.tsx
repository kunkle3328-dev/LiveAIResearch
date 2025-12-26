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
    let tick = 0;
    
    // Tron/Cyberpunk Config
    const neonColors = [
      { color: '#00f3ff', blur: 15, speed: 0.1 }, // Cyan Neon
      { color: '#bc13fe', blur: 15, speed: 0.08 }, // Purple Neon
      { color: '#ffffff', blur: 10, speed: 0.05 }  // Core White
    ];

    const render = () => {
      // Clear with slight trail for motion blur effect
      ctx.fillStyle = 'rgba(2, 6, 23, 0.3)'; // Match slate-950 with transparency
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      // Reactivity: Make it pulsate more when active
      const targetVolume = isActive ? Math.max(volume, 0.01) : 0.005;
      const amplitudeMultiplier = isActive ? 1.5 : 0.2;
      
      tick += isActive ? 0.3 : 0.05;

      neonColors.forEach((layer, i) => {
          ctx.beginPath();
          ctx.strokeStyle = layer.color;
          ctx.lineWidth = isActive ? 3 : 1;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.shadowBlur = isActive ? layer.blur : 5;
          ctx.shadowColor = layer.color;

          // Digital/Tech Waveform
          // Using multiple sine waves combined with some "noise" for a glitchy digital look
          for (let x = 0; x <= width; x += 4) {
              const xNorm = x / width; // 0 to 1
              
              // Hanning window to fade edges
              const attenuation = Math.sin(xNorm * Math.PI); 
              
              // Frequency modulation based on time and volume
              const freq = (x * 0.02) + (tick * layer.speed) + (i * 1.5);
              
              // Main wave
              let yOffset = Math.sin(freq) * (height * 0.3);
              
              // Second harmonic
              yOffset += Math.sin(freq * 2.5) * (height * 0.1);
              
              // "Digital" jitter
              if (isActive && Math.random() > 0.98) {
                  yOffset += (Math.random() - 0.5) * 30 * targetVolume;
              }

              const y = centerY + (yOffset * targetVolume * 8 * amplitudeMultiplier * attenuation);

              if (x === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
          }
          ctx.stroke();
          // Reset shadow for performance or next layer
          ctx.shadowBlur = 0;
      });

      // Center Line (The Horizon)
      if (!isActive) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(14, 165, 233, 0.2)';
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
            className="w-full h-full object-cover opacity-90"
        />
    </div>
  );
};