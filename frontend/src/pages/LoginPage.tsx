import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const fromRegister = location.state?.registered;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/");
    } catch (err: any) {
      const message = err?.response?.data?.detail || "Login failed.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4 bg-slate-100">
      <div className="w-full max-w-md p-8 bg-white border shadow-lg rounded-2xl">
        <h1 className="text-3xl font-bold text-slate-800">Welcome back</h1>
        <p className="mt-2 text-sm text-slate-500">
          Sign in to continue using CV Matcher.
        </p>
        {fromRegister && (
          <div className="px-4 py-2 mt-4 text-sm border rounded border-emerald-200 bg-emerald-50 text-emerald-700">
            Registration successful. Please log in.
          </div>
        )}
        {error && (
          <div className="px-4 py-2 mt-4 text-sm border rounded border-rose-200 bg-rose-50 text-rose-700">
            {error}
          </div>
        )}
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              className="block mb-1 text-sm font-medium text-slate-600"
              htmlFor="email"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              className="w-full px-3 py-2 text-sm border rounded-lg border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label
              className="block mb-1 text-sm font-medium text-slate-600"
              htmlFor="password"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              className="w-full px-3 py-2 text-sm border rounded-lg border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full px-3 py-2 text-sm font-semibold text-white transition bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-sm text-center text-slate-500">
          No account yet?{" "}
          <Link
            className="font-semibold text-blue-600 hover:underline"
            to="/register"
          >
            Register
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
