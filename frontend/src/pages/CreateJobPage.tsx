import React, { useEffect, useRef, useState } from "react";
import { CreateJobPayload, createJob } from "../services/backend";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const ACCEPTED_FILE_TYPES = [".pdf", ".doc", ".docx", ".zip"];

export default function CreateJobPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<CreateJobPayload>({
    title: "",
    company_name: "",
    jd_text: "",
    hr_email: "",
    coverage_threshold: 0.6,
    attachment: null,
  });
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.role === "employer") {
      setForm((prev) => ({
        ...prev,
        company_name: prev.company_name || user.name || "",
        hr_email: prev.hr_email || user.email || "",
      }));
    }
  }, [user]);
  useEffect(() => {
    const state = location.state as
      | { generatedJd?: string; companyName?: string }
      | null;
    if (state?.generatedJd) {
      setForm((prev) => ({
        ...prev,
        jd_text: state.generatedJd ?? prev.jd_text,
        company_name: state.companyName ?? prev.company_name,
      }));
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      nav(".", { replace: true, state: null });
    }
  }, [location.state, nav]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setForm((prev) => ({ ...prev, attachment: null }));
      return;
    }
    const extension = file.name
      .substring(file.name.lastIndexOf("."))
      .toLowerCase();
    if (extension && !ACCEPTED_FILE_TYPES.includes(extension)) {
      setErr("Unsupported file type. Please upload PDF, Word, or ZIP files.");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setForm((prev) => ({ ...prev, attachment: null }));
      return;
    }
    setErr(null);
    setForm((prev) => ({ ...prev, attachment: file }));
  };

  const clearAttachment = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setForm((prev) => ({ ...prev, attachment: null }));
  };

  const handleCancel = () => {
    clearAttachment();
    if (window.history.length > 1) {
      nav(-1);
    } else {
      nav("/");
    }
  };

  const submit = async () => {
    if (!form.title.trim()) {
      setErr("Job title is required.");
      return;
    }
    if (
      form.coverage_threshold !== undefined &&
      (form.coverage_threshold < 0 || form.coverage_threshold > 1)
    ) {
      setErr("Coverage threshold must be between 0 and 1.");
      return;
    }

    setErr(null);
    setSubmitting(true);
    try {
      await createJob(form);
      clearAttachment();
      nav("/");
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Create failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">
          Create a new job
        </h1>
        <p className="text-sm text-slate-500">
          Describe the position so candidates can match their CVs.
        </p>
      </div>
      {err && (
        <div className="px-4 py-2 text-sm border rounded border-rose-200 bg-rose-50 text-rose-700">
          {err}
        </div>
      )}
      <div className="p-6 space-y-4 bg-white border shadow-sm rounded-xl border-slate-200">
        <div>
          <label
            className="block mb-1 text-sm font-medium text-slate-600"
            htmlFor="title"
          >
            Job title
          </label>
          <input
            id="title"
            className="w-full px-3 py-2 text-sm border rounded-lg border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Senior Data Analyst"
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            required
          />
        </div>
        <div>
          <label
            className="block mb-1 text-sm font-medium text-slate-600"
            htmlFor="company_name"
          >
            Company / Team
          </label>
          <input
            id="company_name"
            className="w-full px-3 py-2 text-sm border rounded-lg border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Company name"
            value={form.company_name}
            onChange={(e) =>
              setForm((s) => ({ ...s, company_name: e.target.value }))
            }
          />
        </div>
        <div>
          <label
            className="block mb-1 text-sm font-medium text-slate-600"
            htmlFor="hr_email"
          >
            HR email
          </label>
          <input
            id="hr_email"
            type="email"
            className="w-full px-3 py-2 text-sm border rounded-lg border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="hr@example.com"
            value={form.hr_email}
            onChange={(e) =>
              setForm((s) => ({ ...s, hr_email: e.target.value }))
            }
          />
          <p className="mt-1 text-xs text-slate-400">
            Used for automated invite emails once candidates pass the threshold.
          </p>
        </div>
        <div>
          <label
            className="block mb-1 text-sm font-medium text-slate-600"
            htmlFor="jd_text"
          >
            Job description
          </label>
          <textarea
            id="jd_text"
            rows={10}
            className="w-full px-3 py-2 text-sm border rounded-lg border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Describe responsibilities, requirements, and required skills..."
            value={form.jd_text}
            onChange={(e) =>
              setForm((s) => ({ ...s, jd_text: e.target.value }))
            }
          />
        </div>
        <div>
          <label
            className="block mb-1 text-sm font-medium text-slate-600"
            htmlFor="jd_file"
          >
            JD attachment (optional)
          </label>
          <input
            ref={fileInputRef}
            id="jd_file"
            type="file"
            accept=".pdf,.doc,.docx,.zip"
            className="w-full text-sm file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-100"
            onChange={handleFileChange}
          />
          {form.attachment && (
            <div className="flex items-center gap-3 mt-2 text-sm text-slate-600">
              <span>{form.attachment.name}</span>
              <button
                type="button"
                onClick={clearAttachment}
                className="text-xs font-medium text-rose-500 hover:underline"
              >
                Remove
              </button>
            </div>
          )}
          <p className="mt-1 text-xs text-slate-400">
            Upload the fully formatted JD (PDF, Word, or ZIP). Students will be
            able to download this file.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <label
            htmlFor="coverage_threshold"
            className="font-medium text-slate-600"
          >
            Coverage threshold
          </label>
          <input
            id="coverage_threshold"
            type="number"
            min={0}
            max={1}
            step={0.05}
            className="w-24 px-3 py-2 text-sm border rounded-lg border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            value={form.coverage_threshold}
            onChange={(e) =>
              setForm((s) => ({
                ...s,
                coverage_threshold: Number(e.target.value) || 0,
              }))
            }
          />
          <span className="text-xs text-slate-400">
            Candidates must reach this coverage score to be considered "passed".
          </span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="px-4 py-2 text-sm font-semibold text-white transition bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 disabled:opacity-60"
          onClick={submit}
          disabled={submitting}
        >
          {submitting ? "Creating..." : "Create job"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 text-sm font-semibold transition bg-white border rounded-lg shadow-sm text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-100"
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
