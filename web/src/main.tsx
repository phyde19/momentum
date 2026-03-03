import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./index.css";
import { RootLayout } from "./routes/root";
import { DriverDetailPage } from "./routes/driver-detail";
import { DriversPage } from "./routes/drivers";
import { InitiativeDetailPage } from "./routes/initiative-detail";
import { InitiativesPage } from "./routes/initiatives";
import { TasksPage } from "./routes/tasks";
import { TaskDetailPage } from "./routes/task-detail";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/tasks" replace /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "tasks/new", element: <TaskDetailPage /> },
      { path: "tasks/:taskId", element: <TaskDetailPage /> },
      { path: "initiatives", element: <InitiativesPage /> },
      { path: "initiatives/new", element: <InitiativeDetailPage /> },
      { path: "initiatives/:initiativeId", element: <InitiativeDetailPage /> },
      { path: "drivers", element: <DriversPage /> },
      { path: "drivers/new", element: <DriverDetailPage /> },
      { path: "drivers/:driverId", element: <DriverDetailPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
