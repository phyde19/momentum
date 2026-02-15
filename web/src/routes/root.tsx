import { Outlet } from "react-router";
import { Sidebar } from "../components/sidebar";

export function RootLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
