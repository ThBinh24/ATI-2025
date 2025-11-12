import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const rawName = user?.name || "Unnamed";
  const cleanedName = rawName.replace(/\s*\((student|employer|admin)\)$/i, "");
  const roleLabel = user?.role ? user.role.toUpperCase() : "";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-white border-b">
        <div className="flex items-center justify-between max-w-6xl px-4 py-4 mx-auto">
          <Link to="/" className="text-3xl font-semibold text-blue-600">
            CV Matcher
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {user?.role === "student" && (
              <Link
                to="/"
                className="px-3 py-2 transition rounded hover:bg-slate-100"
              >
                Job Listings
              </Link>
            )}
            {user?.role === "employer" && (
              <Link
                to="/"
                className="px-3 py-2 transition rounded hover:bg-slate-100"
              >
                Manage Jobs
              </Link>
            )}
            {user?.role === "student" && (
              <Link
                to="/interview"
                className="px-3 py-2 transition rounded hover:bg-slate-100"
              >
                Interview Practice
              </Link>
            )}
            {user?.role === "student" && (
              <Link
                to="/profile-builder"
                className="px-3 py-2 transition rounded hover:bg-slate-100"
              >
                AI Profile Builder
              </Link>
            )}
            {user?.role === "employer" && (
              <>
                <Link
                  to="/jobs/generator"
                  className="px-3 py-2 transition rounded hover:bg-slate-100"
                >
                  Job Description Generator
                </Link>
                <Link
                  to="/interview/questions"
                  className="px-3 py-2 transition rounded hover:bg-slate-100"
                >
                  AI Interview Questions
                </Link>
              </>
            )}
          </nav>
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <div className="hidden text-right sm:block">
              <div className="font-medium text-slate-800">{cleanedName}</div>
              <div className="text-xs tracking-wide uppercase text-slate-500">
                {roleLabel}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      <main className="w-full max-w-6xl px-4 py-8 mx-auto">{children}</main>
    </div>
  );
};

export default AppLayout;
