import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./index.css";
import { RootLayout } from "./routes/root";
import { TasksPage } from "./routes/tasks";
import { TaskDetailPage } from "./routes/task-detail";
import { GoalsPage } from "./routes/goals";
import { GoalDetailPage } from "./routes/goal-detail";

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
      { path: "goals", element: <GoalsPage /> },
      { path: "goals/new", element: <GoalDetailPage /> },
      { path: "goals/:goalId", element: <GoalDetailPage /> },
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
