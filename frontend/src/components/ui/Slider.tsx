import React from "react";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  label?: string;
  unit?: string;
  disabled?: boolean;
  className?: string;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  unit = "",
  disabled = false,
  className = "",
}) => {
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
          <span>{label}</span>
          <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-xs font-mono font-medium text-blue-400 border border-blue-500/20">
            {value} {unit}
          </span>
        </div>
      )}
      <div className="relative flex items-center h-6 select-none">
        {/* Track */}
        <div className="relative h-2 w-full rounded-full bg-[#172338] overflow-hidden border border-[#26354c]/60">
          <div
            className="h-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-75"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Real accessible range input layered invisibly over track */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          aria-label={label || "Slider"}
        />

        {/* Custom Visible Thumb with glow */}
        <div
          className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.8)] transition-all duration-75"
          style={{
            left: `calc(${percentage}% - 8px)`,
          }}
        />
      </div>
    </div>
  );
};

