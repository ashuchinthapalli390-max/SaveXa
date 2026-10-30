import React from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
  size?: "sm" | "md";
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = "",
  size = "md",
}) => {
  return (
    <div
      className={`inline-flex items-center rounded-xl bg-[#0b1220] p-1 border border-[#1e293b] select-none ${className}`}
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={`relative flex items-center gap-2 rounded-lg font-medium transition-all duration-150 focus:outline-none ${
              size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"
            } ${
              isActive
                ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.35)]"
                : "text-slate-400 hover:text-slate-200 hover:bg-[#172338]/60"
            }`}
          >
            {tab.icon && (
              <span className={`shrink-0 ${isActive ? "text-white" : "text-slate-400"}`}>
                {tab.icon}
              </span>
            )}
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-mono font-bold ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-[#172338] text-slate-400 border border-[#26354c]"
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

