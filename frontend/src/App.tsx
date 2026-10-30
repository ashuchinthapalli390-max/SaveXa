import React, { useState } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";

import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { Dashboard } from "./pages/Dashboard";
import { NewDownload } from "./pages/NewDownload";
import { BulkDownloader } from "./pages/BulkDownloader";
import { ImageDownloader } from "./pages/ImageDownloader";
import { DownloadQueue } from "./pages/DownloadQueue";
import { AudioXa } from "./pages/AudioXa";
import { Playlists } from "./pages/Playlists";
import { MediaLibrary } from "./pages/MediaLibrary";
import { History } from "./pages/History";
import { Settings } from "./pages/Settings";
import { Logs } from "./pages/Logs";

import { useSaveXaSocket } from "./hooks/useSaveXaSocket";
import { pageVariants } from "./animations/variants";

function AppContent() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  const {
    jobs,
    connected,
    activeDownloads,
    activeCount,
    queuedCount,
    totalSpeed,
    refreshJobs,
  } = useSaveXaSocket();

  return (
    <div className="min-h-screen bg-[#080d17] text-[#f8fafc] flex">
      {/* Sidebar */}
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
        activeCount={activeCount}
        queuedCount={queuedCount}
        connected={connected}
        totalSpeed={totalSpeed}
      />

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 min-h-screen ${
          collapsed ? "ml-20" : "ml-64"
        }`}
      >
        <TopBar totalSpeed={totalSpeed} activeCount={activeCount} />

        <main className="flex-1 p-6 sm:p-8 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial="initial"
              animate="animate"
              exit="exit"
              variants={pageVariants}
            >
              <Routes location={location}>
                <Route
                  path="/"
                  element={
                    <Dashboard
                      jobs={jobs}
                      activeDownloads={activeDownloads}
                      refreshJobs={refreshJobs}
                    />
                  }
                />
                <Route path="/new" element={<NewDownload />} />
                <Route path="/bulk" element={<BulkDownloader />} />
                <Route path="/images" element={<ImageDownloader />} />
                <Route
                  path="/queue"
                  element={
                    <DownloadQueue
                      jobs={jobs}
                      refreshJobs={refreshJobs}
                      totalSpeed={totalSpeed}
                    />
                  }
                />
                <Route path="/audio" element={<AudioXa />} />
                <Route path="/playlists" element={<Playlists />} />
                <Route path="/library" element={<MediaLibrary />} />
                <Route path="/history" element={<History />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/logs" element={<Logs jobs={jobs} />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
