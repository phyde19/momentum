import { NavLink, Link, useLocation } from "react-router";
import {
  CalendarClock,
  CheckSquare,
  Target,
  Plus,
  Zap,
  Layers3,
} from "lucide-react";
import { cn } from "../lib/utils";

const navItems = [
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/blocks", label: "Blocks", icon: CalendarClock },
  { to: "/initiatives", label: "Initiatives", icon: Target },
  { to: "/drivers", label: "Drivers", icon: Layers3 },
];

export function Sidebar() {
  const location = useLocation();

  return (
    <aside className="flex w-64 flex-col border-r border-zinc-200 bg-zinc-900 text-zinc-300">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2.5 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <span className="text-base font-semibold tracking-tight text-white">
          Momentum
        </span>
      </div>

      {/* Navigation */}
      <nav className="mt-4 flex-1 space-y-1 px-3">
        <p className="mb-2 px-2 text-2xs font-semibold uppercase tracking-widest text-zinc-500">
          Workspace
        </p>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100",
              )
            }
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Quick add */}
      <div className="space-y-1.5 border-t border-zinc-800 p-3">
        <p className="mb-2 px-2 text-2xs font-semibold uppercase tracking-widest text-zinc-500">
          Quick add
        </p>
        <Link
          to="/tasks/new"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
            location.pathname === "/tasks/new"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100",
          )}
        >
          <Plus className="h-[18px] w-[18px]" />
          New Task
        </Link>
        <Link
          to="/blocks/new"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
            location.pathname === "/blocks/new"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100",
          )}
        >
          <Plus className="h-[18px] w-[18px]" />
          New Block
        </Link>
        <Link
          to="/initiatives/new"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
            location.pathname === "/initiatives/new"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100",
          )}
        >
          <Plus className="h-[18px] w-[18px]" />
          New Initiative
        </Link>
        <Link
          to="/drivers/new"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150",
            location.pathname === "/drivers/new"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100",
          )}
        >
          <Plus className="h-[18px] w-[18px]" />
          New Driver
        </Link>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800 px-5 py-3">
        <p className="truncate text-xs text-zinc-500">
          {import.meta.env.VITE_DEV_USER_EMAIL || "owner@example.com"}
        </p>
      </div>
    </aside>
  );
}
