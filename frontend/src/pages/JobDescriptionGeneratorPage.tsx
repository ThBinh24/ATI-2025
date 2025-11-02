import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { JobDescriptionPayload, generateJobDescription } from "../services/backend";

interface FormState {
  title: string;
  experience_level: string;
  core_skills: string;
  responsibilities: string;
  benefits: string;
  company_name: string;
  tone: string;
}

const defaultState: FormState = {
  title: "",
  experience_level: "",
  core_skills: "",
  responsibilities: "",
  benefits: "",
  company_name: "",
  tone: "",
};

const JobDescriptionGeneratorPage: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(defaultState);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string>("");
  const [source, setSource] = useState<string | null>(null);

  const disableGenerate = useMemo(() => !form.title.trim(), [form.title]);

  const handleChange = (key: keyof FormState) =>
    (value: string) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disableGenerate) {
      setError("Job title is required.");
      return;
    }
    setError(null);
    setLoading(true);
    setSource(null);
    try {
      const payload: JobDescriptionPayload = {
        title: form.title.trim(),
        experience_level: form.experience_level.trim() || undefined,
        core_skills: form.core_skills
          .split(",")
          .map((skill) => skill.trim())
          .filter(Boolean),
        responsibilities: form.responsibilities.trim() || undefined,
        benefits: form.benefits.trim() || undefined,
        company_name: form.company_name.trim() || undefined,
        tone: form.tone.trim() || undefined,
      };
      if (!payload.core_skills?.length) {
        delete payload.core_skills;
      }
      const res = await generateJobDescription(payload);
      setResult(res.data?.jd_text || "");
      setSource(res.data?.source || "gemini");
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "Unable to generate job description. Please try again.",
      );
      setResult("");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setError(null);
    } catch {
      setError("Failed to copy JD to clipboard.");
    }
  };

  const handleUseInCreateJob = () => {
    if (!result) return;
    navigate("/jobs/new", {
      state: {
        generatedJd: result,
        companyName: form.company_name,
      },
    });
  };

  return (
    <div className="max-w-5xl p-6 mx-auto space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          Job Description Generator
        </h1>
        <p className="text-sm text-slate-600">
          Provide a few details and let AI draft a polished job description. You
          can review and edit the result before publishing.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="p-6 space-y-4 bg-white border shadow-sm rounded-2xl border-slate-200"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label
              htmlFor="title"
              className="block text-sm font-medium text-slate-700"
            >
              Job title
            </label>
            <input
              id="title"
              className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Product Manager"
              value={form.title}
              onChange={(e) => handleChange("title")(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="experience_level"
              className="block text-sm font-medium text-slate-700"
            >
              Experience level
            </label>
            <input
              id="experience_level"
              className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Mid-level, Senior, Internship..."
              value={form.experience_level}
              onChange={(e) => handleChange("experience_level")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="core_skills"
              className="block text-sm font-medium text-slate-700"
            >
              Core skills (comma separated)
            </label>
            <input
              id="core_skills"
              className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="SQL, Tableau, stakeholder management"
              value={form.core_skills}
              onChange={(e) => handleChange("core_skills")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="company_name"
              className="block text-sm font-medium text-slate-700"
            >
              Company
            </label>
            <input
              id="company_name"
              className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              placeholder="Acme Corp"
              value={form.company_name}
              onChange={(e) => handleChange("company_name")(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="tone"
            className="block text-sm font-medium text-slate-700"
          >
            Tone / style (optional)
          </label>
          <input
            id="tone"
            className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Friendly, data-driven, inclusive..."
            value={form.tone}
            onChange={(e) => handleChange("tone")(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">
            Responsibilities focus (optional)
          </label>
          <textarea
            className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            rows={3}
            placeholder="Call out specific projects or deliverables..."
            value={form.responsibilities}
            onChange={(e) => handleChange("responsibilities")(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-700">
            Benefits focus (optional)
          </label>
          <textarea
            className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            rows={3}
            placeholder="Mention compensation, flexibility, culture..."
            value={form.benefits}
            onChange={(e) => handleChange("benefits")(e.target.value)}
          />
        </div>

        {error && (
          <div className="px-4 py-2 text-sm border rounded border-rose-200 bg-rose-50 text-rose-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || disableGenerate}
          className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white transition bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Generating..." : "Generate JD"}
        </button>
      </form>

      <section className="p-6 space-y-4 bg-white border shadow-sm rounded-2xl border-slate-200">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Generated job description
            </h2>
            <p className="text-sm text-slate-500">
              Adjust the content as needed before publishing. You can copy or
              send it to the Create Job form.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!result}
              className="px-3 py-2 text-xs font-medium transition border rounded-lg border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Copy to clipboard
            </button>
            <button
              type="button"
              onClick={handleUseInCreateJob}
              disabled={!result}
              className="px-3 py-2 text-xs font-semibold text-white transition rounded-lg shadow-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
            >
              Use in Create Job
            </button>
          </div>
        </div>
        {source && (
          <div className="text-xs text-slate-500">
            Source: {source === "gemini" ? "Gemini" : "Fallback template"}
          </div>
        )}
        <textarea
          className="w-full px-3 py-3 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          rows={16}
          placeholder="Generated JD will appear here."
          value={result}
          onChange={(e) => setResult(e.target.value)}
        />
      </section>
    </div>
  );
};

export default JobDescriptionGeneratorPage;

