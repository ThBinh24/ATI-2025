import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { RegisterPayload } from "../services/auth";

const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterPayload>({
    name: "",
    email: "",
    password: "",
    role: "student",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field: keyof RegisterPayload, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register(form);
      navigate("/login", { state: { registered: true } });
    } catch (err: any) {
      const message = err?.response?.data?.detail || "Registration failed.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4 bg-slate-100">
      <div className="w-full max-w-md p-8 bg-white shadow-lg rounded-2xl">
        <h1 className="text-2xl font-semibold text-slate-800">
          Create your account
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Join as an applicant or employer to explore CV Matcher.
        </p>
        {error && (
          <div className="px-4 py-2 mt-4 text-sm border rounded border-rose-200 bg-rose-50 text-rose-700">
            {error}
          </div>
        )}
        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              className="block mb-1 text-sm font-medium text-slate-600"
              htmlFor="name"
            >
              Full name
            </label>
            <input
              id="name"
              className="w-full px-3 py-2 text-sm border rounded-lg border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Nguyen Van A"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              required
            />
          </div>
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
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
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
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(e) => handleChange("password", e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div>
            <label
              className="block mb-1 text-sm font-medium text-slate-600"
              htmlFor="role"
            >
              Role
            </label>
            <select
              id="role"
              className="w-full px-3 py-2 text-sm border rounded-lg border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={form.role}
              onChange={(e) =>
                handleChange("role", e.target.value as RegisterPayload["role"])
              }
            >
              <option value="student">Applicant / Student</option>
              <option value="employer">Employer</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full px-3 py-2 text-sm font-semibold text-white transition bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Creating..." : "Create account"}
          </button>
        </form>
        <p className="mt-6 text-sm text-center text-slate-500">
          Already have an account?{" "}
          <Link
            className="font-semibold text-blue-600 hover:underline"
            to="/login"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
