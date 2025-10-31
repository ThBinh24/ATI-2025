import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getJob, updateJob, UpdateJobPayload } from "../services/backend";
import { useAuth } from "../context/AuthContext";

const ACCEPTED_FILE_TYPES = [".pdf", ".doc", ".docx", ".zip"];

interface FormState extends UpdateJobPayload {
  remove_attachment: boolean;
}

const defaultState: FormState = {
  title: "",
  company_name: "",
  jd_text: "",
  hr_email: "",
  coverage_threshold: 0.6,
  attachment: null,
  remove_attachment: false,
};

export default function EditJobPage() {
  const { id } = useParams();
  const jobId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState<FormState>(defaultState);
  const [existingAttachment, setExistingAttachment] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(jobId)) {
      setError("Invalid job identifier.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getJob(jobId)
      .then((res) => {
        const job = res.data;
        if (!job) {
          setError("Job not found.");
          return;
        }
        if (
          user?.role === "employer" &&
          job.employer_id &&
          job.employer_id !== user.id
        ) {
          setError("You do not have permission to edit this job.");
          return;
        }
        setForm({
          title: job.title ?? "",
          company_name: job.company_name ?? "",
          jd_text: job.jd_text ?? "",
          hr_email: job.hr_email ?? "",
          coverage_threshold:
            typeof job.coverage_threshold === "number"
              ? job.coverage_threshold
              : Number(job.coverage_threshold) || 0.6,
          attachment: null,
          remove_attachment: false,
        });
        setExistingAttachment(job.attachment_name ?? null);
      })
      .catch((err) => {
        setError(err?.response?.data?.detail || "Failed to load job details.");
      })
      .finally(() => setLoading(false));
  }, [jobId, user]);

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
      setError("Unsupported file type. Please upload PDF, Word, or ZIP files.");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }
    setError(null);
    setForm((prev) => ({
      ...prev,
      attachment: file,
      remove_attachment: false,
    }));
  };

  const clearAttachmentSelection = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setForm((prev) => ({ ...prev, attachment: null, remove_attachment: true }));
  };

  const submit = async () => {
    if (!form.title.trim()) {
      setError("Job title is required.");
      return;
    }
    if (
      form.coverage_threshold !== undefined &&
      (form.coverage_threshold < 0 || form.coverage_threshold > 1)
    ) {
      setError("Coverage threshold must be between 0 and 1.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateJob(jobId, form);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to update job.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Edit job</h1>
        <p className="text-sm text-slate-500">
          Update the job information. Changes may require admin review again.
        </p>
      </div>
      {error && (
        <div className="px-4 py-2 text-sm border rounded border-rose-200 bg-rose-50 text-rose-700">
          {error}
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
            JD attachment
          </label>
          <input
            ref={fileInputRef}
            id="jd_file"
            type="file"
            accept=".pdf,.doc,.docx,.zip"
            className="w-full text-sm file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-100"
            onChange={handleFileChange}
          />
          <div className="mt-2 text-sm text-slate-600">
            {form.attachment ? (
              <div className="flex items-center gap-3">
                <span>{form.attachment.name}</span>
                <button
                  type="button"
                  onClick={clearAttachmentSelection}
                  className="text-xs font-medium text-rose-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            ) : existingAttachment && !form.remove_attachment ? (
              <div className="flex items-center gap-3">
                <span>Current: {existingAttachment}</span>
                <button
                  type="button"
                  onClick={clearAttachmentSelection}
                  className="text-xs font-medium text-rose-500 hover:underline"
                >
                  Remove attachment
                </button>
              </div>
            ) : (
              <span className="text-slate-400">No attachment selected.</span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Upload a new file to replace the previous attachment or remove it
            completely.
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
          className="px-4 py-2 text-sm font-semibold text-white transition bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 disabled:opacity-60"
          onClick={submit}
          disabled={saving}
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        <button
          type="button"
          className="px-4 py-2 text-sm font-medium transition border rounded-lg border-slate-300 text-slate-600 hover:bg-slate-100"
          onClick={() => navigate(-1)}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
