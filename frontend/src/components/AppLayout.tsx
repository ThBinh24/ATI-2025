import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getProfileInfo, subscribeProfileInfo } from "../lib/profileStore";

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout } = useAuth();
  const userId = user?.id ?? null;
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [storedProfile, setStoredProfile] = useState(getProfileInfo(userId));

  const rawName = user?.name || "Unnamed";
  const cleanedName = rawName.replace(/\s*\((student|employer|admin)\)$/i, "");
  const roleLabel = user?.role ? user.role.toUpperCase() : "";
  const initials = useMemo(() => {
    const target = storedProfile.name || cleanedName || "U";
    return target
      .split(" ")
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [storedProfile.name, cleanedName]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  useEffect(() => {
    setStoredProfile(getProfileInfo(userId));
  }, [userId]);

  useEffect(() => {
    const unsub = subscribeProfileInfo(() => setStoredProfile(getProfileInfo(userId)));
    return unsub;
  }, [userId]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest("#user-menu-button") && !target.closest("#user-menu-dropdown")) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

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
              <div className="font-medium text-slate-800">{storedProfile.name || cleanedName}</div>
              <div className="text-xs tracking-wide uppercase text-slate-500">{roleLabel}</div>
            </div>
            <div className="relative">
              <button
                id="user-menu-button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="flex items-center justify-center w-10 h-10 text-sm font-semibold text-white bg-blue-600 rounded-full"
                style={{
                backgroundImage: storedProfile.avatarDataUrl ? `url(${storedProfile.avatarDataUrl})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              {!storedProfile.avatarDataUrl && initials}
            </button>
            {menuOpen && (
              <div
                id="user-menu-dropdown"
                className="absolute right-0 z-10 w-48 mt-2 overflow-hidden bg-white border shadow-lg rounded-xl border-slate-200"
              >
                
                <div className="flex flex-col text-sm">
                  <Link
                    to="/profile"
                    className="px-4 py-2 text-left transition hover:bg-slate-100"
                    onClick={() => setMenuOpen(false)}
                  >
                    My Profile
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="px-4 py-2 text-left transition text-rose-600 hover:bg-slate-100"
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      </header>
      <main className="w-full max-w-6xl px-4 py-8 mx-auto">{children}</main>
    </div>
  );
};

export default AppLayout;
