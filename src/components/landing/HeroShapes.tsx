'use client';

export function HeroShapes() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* Large floating document shape - Desktop Only */}
      <div className="hidden lg:block absolute -right-20 top-20 h-[600px] w-[600px] opacity-[0.4] dark:opacity-[0.3] pointer-events-none select-none animate-float-slow rotate-12">
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="0.5" 
          className="w-full h-full text-black dark:text-white"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14 2 14 8 20 8"></polyline>
          <line x1="16" y1="13" x2="8" y2="13"></line>
          <line x1="16" y1="17" x2="8" y2="17"></line>
          <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
      </div>
    </div>
  );
}
