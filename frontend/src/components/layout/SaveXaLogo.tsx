import React, { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

interface SaveXaLogoProps {
  size?: number;
  showText?: boolean;
  className?: string;
}

export const SaveXaLogo: React.FC<SaveXaLogoProps> = ({ size = 32, showText = true, className = "" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<SVGPathElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);

  useGSAP(
    () => {
      if (arrowRef.current && ringRef.current) {
        const tl = gsap.timeline();
        tl.fromTo(
          ringRef.current,
          { strokeDashoffset: 100, opacity: 0 },
          { strokeDashoffset: 0, opacity: 1, duration: 0.8, ease: "power2.out" }
        ).fromTo(
          arrowRef.current,
          { y: -6, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.7)" },
          "-=0.4"
        );
      }
    },
    { scope: containerRef }
  );

  return (
    <div ref={containerRef} className={`flex items-center gap-3 ${className}`}>
      <div
        className="relative flex items-center justify-center rounded-xl bg-gradient-to-br from-blue-600/30 to-sky-500/20 border border-blue-500/40 p-2 shadow-lg shadow-blue-900/20"
        style={{ width: size + 16, height: size + 16 }}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="text-blue-400"
        >
          <circle
            ref={ringRef}
            cx="12"
            cy="12"
            r="9.5"
            stroke="url(#savexa_grad)"
            strokeWidth="1.8"
            strokeDasharray="60"
            strokeLinecap="round"
          />
          <path
            ref={arrowRef}
            d="M12 7V14M12 14L8.5 10.5M12 14L15.5 10.5M8 17H16"
            stroke="#F8FAFC"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="savexa_grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#2563EB" />
              <stop offset="0.5" stopColor="#3B82F6" />
              <stop offset="1" stopColor="#60A5FA" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <span className="text-xl font-bold tracking-tight text-white">Save</span>
            <span className="text-xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-sky-300">
              Xa
            </span>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">
            Local Media Engine V2
          </span>
        </div>
      )}
    </div>
  );
};
