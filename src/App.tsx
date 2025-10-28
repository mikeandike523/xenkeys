// App.tsx
import { Route, Routes } from "react-router-dom";
import { Suspense, lazy } from "react";

import "./App.css";

// ✅ Lazy load each page
const PageHome = lazy(() => import("./pages/Home"));
const PagePlay = lazy(() => import("./pages/Play"));
const PageCompose = lazy(() => import("./pages/Compose"));

export default function App() {
  return (
    // ✅ Wrap in <Suspense> to show a fallback while chunk loads
    <Suspense fallback={<></>}>
      <Routes>
        <Route path="/" element={<PageHome />} />
        <Route path="/play" element={<PagePlay />} />
        <Route path="/compose" element={<PageCompose />} />
      </Routes>
    </Suspense>
  );
}