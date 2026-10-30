import React from "react";
import { Check, Minus } from "lucide-react";

interface CheckboxProps {
  id?: string;
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  id,
  checked,
  indeterminate = false,
  onChange,
  disabled = false,
  label,
  description,
  className = "",
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      onChange(!checked);
    }
  };

  const isCheckedOrIndeterminate = checked || indeterminate;

  return (
    <div
      className={`inline-flex items-start gap-2.5 ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer select-none"} ${className}`}
      onClick={handleClick}
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={handleKeyDown}
      id={id}
    >
      <div
        className={`relative mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all duration-150 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080d17] ${
          isCheckedOrIndeterminate
            ? "border-blue-600 bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.4)]"
            : "border-[#26354c] bg-[#111a2b] hover:border-blue-500/80"
        }`}
      >
        {indeterminate ? (
          <Minus className="h-3 w-3 text-white transition-transform duration-150 stroke-[3]" />
        ) : checked ? (
          <Check className="h-3 w-3 text-white transition-transform duration-150 stroke-[3]" />
        ) : null}
      </div>

      {(label || description) && (
        <div className="flex flex-col text-sm leading-tight">
          {label && <span className="font-medium text-slate-200">{label}</span>}
          {description && <span className="mt-0.5 text-xs text-slate-400">{description}</span>}
        </div>
      )}
    </div>
  );
};

