import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import JobsPage from "./pages/JobsPage";
import CreateJobPage from "./pages/CreateJobPage";
import EditJobPage from "./pages/EditJobPage";
import ApplyPage from "./pages/ApplyPage";
import ApplicantsPage from "./pages/ApplicantsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AdminDashboard from "./pages/AdminDashboard";
import InterviewPracticePage from "./pages/InterviewPracticePage";
import JobDescriptionGeneratorPage from "./pages/JobDescriptionGeneratorPage";
import InterviewQuestionsPage from "./pages/InterviewQuestionsPage";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "./context/AuthContext";

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    path: "/",
    element: (
      <ProtectedRoute>
        <JobsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/interview",
    element: (
      <ProtectedRoute roles={["student", "admin"]}>
        <InterviewPracticePage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/interview/questions",
    element: (
      <ProtectedRoute roles={["employer", "admin"]}>
        <InterviewQuestionsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/jobs/new",
    element: (
      <ProtectedRoute roles={["admin", "employer"]}>
        <CreateJobPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/jobs/:id/edit",
    element: (
      <ProtectedRoute roles={["admin", "employer"]}>
        <EditJobPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/jobs/generator",
    element: (
      <ProtectedRoute roles={["employer", "admin"]}>
        <JobDescriptionGeneratorPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/jobs/:id/apply",
    element: (
      <ProtectedRoute roles={["student", "admin", "employer"]}>
        <ApplyPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/jobs/:id/applicants",
    element: (
      <ProtectedRoute roles={["admin", "employer"]}>
        <ApplicantsPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/admin",
    element: (
      <ProtectedRoute roles={["admin"]}>
        <AdminDashboard />
      </ProtectedRoute>
    ),
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>,
);
