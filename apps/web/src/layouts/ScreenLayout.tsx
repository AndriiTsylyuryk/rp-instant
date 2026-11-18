import { Outlet } from "react-router-dom";

export function ScreenLayout() {
  return (
    <div className="screen">
      <Outlet />
    </div>
  );
}
