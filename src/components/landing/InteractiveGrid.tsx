'use client';

import { useEffect, useRef, useState } from 'react';

export function InteractiveGrid() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      setMousePosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="absolute inset-0 z-0 pointer-events-none overflow-hidden"
    >
      {/* Base Grid */}
      <div 
        className="absolute inset-0 opacity-[0.4] dark:opacity-[0.2]"
        style={{
          backgroundImage: `linear-gradient(to right, var(--grid-color) 1px, transparent 1px),
                           linear-gradient(to bottom, var(--grid-color) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
          maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)'
        }}
      />

      {/* Mouse Glow Effect */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          background: `radial-gradient(800px circle at ${mousePosition.x}px ${mousePosition.y}px, var(--glow-color), transparent 40%)`,
          opacity: 0.6,
        }}
      />

      <style jsx global>{`
        :root {
          --grid-color: #e5e7eb;
          --glow-color: rgba(46, 160, 67, 0.25);
        }
        .dark {
          --grid-color: #27272a;
          --glow-color: rgba(46, 160, 67, 0.15);
        }
      `}</style>
    </div>
  );
}
