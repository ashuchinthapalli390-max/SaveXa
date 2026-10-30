import React from "react";
import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import {
  LayoutDashboard,
  PlusCircle,
  Layers,
  Image as ImageIcon,
  ListOrdered,
  Music,
  ListMusic,
  FolderOpen,
  History,
  Settings,
  Terminal,
  Activity,
  ChevronLeft,
  ChevronRight,
  Wifi,
  WifiOff,
} from "lucide-react";
import { SaveXaLogo } from "./SaveXaLogo";
import { formatDualSpeed } from "../../utils/formatters";

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeCount: number;
  queuedCount: number;
  connected: boolean;
  totalSpeed: number;
}

const navItems = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/new", label: "New Download", icon: PlusCircle },
  { path: "/bulk", label: "Bulk Downloader", icon: Layers, badgeKey: "bulk" },
  { path: "/images", label: "Image Downloader", icon: ImageIcon, badgeKey: "images" },
  { path: "/queue", label: "Download Queue", icon: ListOrdered, badgeKey: "active" },
  { path: "/audio", label: "AudioXa", icon: Music },
  { path: "/playlists", label: "Playlists", icon: ListMusic },
  { path: "/library", label: "Media Library", icon: FolderOpen },
  { path: "/history", label: "History", icon: History },
  { path: "/settings", label: "Settings", icon: Settings },
  { path: "/logs", label: "System Logs", icon: Terminal },
];

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  activeCount,
  queuedCount,
  connected,
  totalSpeed,
}) => {
  return (
    <aside
      className={`fixed top-0 left-0 h-screen z-40 flex flex-col justify-between transition-all duration-300 border-r border-[#1e293b]/70 bg-[#080d17]/95 backdrop-blur-xl ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between px-4 py-5 border-b border-[#1e293b]/70">
          <SaveXaLogo size={28} showText={!collapsed} />
          <button
            onClick={onToggleCollapse}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Navigation links */}
        <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-210px)]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const hasActiveBadge = item.badgeKey === "active" && activeCount > 0;
            const hasQueuedBadge = item.badgeKey === "active" && queuedCount > 0 && activeCount === 0;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? "text-white bg-blue-600/20 border border-blue-500/40 shadow-inner"
                      : "text-slate-400 hover:text-slate-100 hover:bg-white/[0.04]"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={20}
                      className={isActive ? "text-blue-400" : "text-slate-400"}
                    />
                    {!collapsed && <span>{item.label}</span>}

                    {/* Active badge */}
                    {hasActiveBadge && (
                      <span className="ml-auto flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-600 text-white animate-pulse">
                        {activeCount}
                      </span>
                    )}
                    {hasQueuedBadge && (
                      <span className="ml-auto flex items-center justify-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-[#172338] text-slate-300 border border-[#26354c]">
                        {queuedCount}
                      </span>
                    )}

                    {isActive && (
                      <motion.div
                        layoutId="activeNavIndicator"
                        className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-blue-500"
                        transition={{ type: "spring", stiffness: 350, damping: 30 }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer Metrics */}
      <div className="p-3 border-t border-[#1e293b]/70 bg-[#0b1220]/80">
        {!collapsed ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span className="flex items-center gap-1.5">
                {connected ? (
                  <Wifi size={13} className="text-emerald-400" />
                ) : (
                  <WifiOff size={13} className="text-amber-400" />
                )}
                <span>{connected ? "Engine Live" : "Reconnecting"}</span>
              </span>
              <span className="font-mono text-blue-300 font-medium text-[11px]">
                {formatDualSpeed(totalSpeed)}
              </span>
            </div>

            <div className="p-2 rounded-lg bg-[#111a2b] border border-[#1e293b] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-blue-400" />
                <span className="text-slate-300">Active</span>
              </div>
              <span className="font-semibold text-white">{activeCount} workers</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-1">
            <span
              title={connected ? "Engine Live" : "Connecting"}
              className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`}
            />
          </div>
        )}
      </div>
    </aside>
  );
};
