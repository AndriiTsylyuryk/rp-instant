import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { RequireRole } from "./auth/RequireRole";
import { PlayerLayout } from "./layouts/PlayerLayout";
import { ScreenLayout } from "./layouts/ScreenLayout";
import Home from "./pages/Home";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Play from "./pages/Play";
import Screen from "./pages/Screen";

const AdminLayout = lazy(() => import("./layouts/AdminLayout"));
const AdminHome = lazy(() => import("./pages/admin/AdminHome"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const Me = lazy(() => import("./pages/Me"));

export default function App() {
  return (
    <Suspense fallback={<div className="page center">Loading…</div>}>
      <Routes>
        <Route element={<PlayerLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/join" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/play/:code" element={<Play />} />
          <Route
            path="/me"
            element={
              <RequireRole roles={["fan"]}>
                <Me />
              </RequireRole>
            }
          />
        </Route>

        <Route element={<ScreenLayout />}>
          <Route path="/screen/:code" element={<Screen />} />
        </Route>

        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin"
          element={
            <RequireRole roles={["manager"]} redirectTo="/admin/login">
              <AdminLayout />
            </RequireRole>
          }
        >
          <Route index element={<AdminHome />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
