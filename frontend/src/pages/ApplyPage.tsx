import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  downloadJobAttachment,
  getJob,
  logApplicant,
  processCV,
  processCVFile,
  uploadCvFile,
} from "../services/backend";
import { useAuth } from "../context/AuthContext";
import { formatTime } from "../lib/time";
import { sanitizeHtml, htmlToPlainText } from "../lib/sanitize";
import RichTextEditor from "../components/text-editor";

export default function ApplyPage() {
  const { id } = useParams();
  const jobId = Number(id);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [job, setJob] = useState<any>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [downloadBusy, setDownloadBusy] = useState(false);

  const [cvText, setCvText] = useState("");
  const [cvHtml, setCvHtml] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const jobDescriptionHtml = sanitizeHtml(job?.jd_text);

  const handleCancel = () => {
    setErr(null);
    setNotice(null);
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  useEffect(() => {
    setLoadingJob(true);
    getJob(jobId)
      .then((r) => setJob(r.data))
      .catch(() => setJob(null))
      .finally(() => setLoadingJob(false));
  }, [jobId]);

  const handleDownloadAttachment = async () => {
    if (!job?.has_attachment) return;
    try {
      setErr(null);
      setNotice(null);
      setDownloadBusy(true);
      const response = await downloadJobAttachment(job.id);
      const blobUrl = window.URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = job.attachment_name || `job-${job.id}-attachment`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      setErr(
        e?.response?.data?.detail ||
          "Failed to download the attachment. Please try again."
      );
    } finally {
      setDownloadBusy(false);
    }
  };

  const runAnalysis = async () => {
    if (!cvFile && !cvText.trim()) {
      setErr("Please upload a CV file or paste your CV text before running.");
      return;
    }
    setErr(null);
    setNotice(null);
    setAnalyzing(true);
    try {
      const res = cvFile
        ? await processCVFile(cvFile, jobId)
        : await processCV({ cv_text: cvText, job_id: jobId });
      setResult(res.data);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Unable to analyze CV.");
    } finally {
      setAnalyzing(false);
    }
  };

  const applyForJob = async () => {
    if (!result || !job) {
      setErr("Run the AI check first so we can attach your screening result.");
      return;
    }
    setErr(null);
    setNotice(null);
    setApplying(true);

    let uploadedFileInfo: { path?: string; filename?: string } | null = null;
    if (cvFile) {
      try {
        const uploadResponse = await uploadCvFile(cvFile);
        uploadedFileInfo = uploadResponse.data;
      } catch (uploadError: any) {
        setErr(
          uploadError?.response?.data?.detail ||
            "Failed to upload CV file. Please try again."
        );
        setApplying(false);
        return;
      }
    }

    const payload = {
      name: user?.name || "Candidate",
      email: user?.email || "candidate@example.com",
      uploaded_filename:
        uploadedFileInfo?.filename || cvFile?.name || "(pasted text)",
      uploaded_file_path: uploadedFileInfo?.path || "",
      job_id: jobId,
      jd_summary: (job.jd_text || "").slice(0, 1000),
      coverage: result.coverage,
      similarity: result.similarity,
      missing: (result.missing || []).join(", "),
      passed: result.passed ? 1 : 0,
      hr_email: job.hr_email || "",
      sent_email: 0,
      predicted_role: result.predicted_role || "",
      company_name: job.company_name || "",
      job_title: job.title || "",
      hr_name: "",
      interview_mode: "",
      schedule_link: "",
      cv_text: cvText,
    };
    try {
      await logApplicant(payload);
      setNotice(
        result.passed
          ? "Your application has been submitted successfully. The employer will review it shortly."
          : "Application submitted. Consider improving your CV based on the AI feedback before reapplying."
      );
    } catch (e: any) {
      setErr(e?.response?.data?.detail || "Failed to submit your application.");
    } finally {
      setApplying(false);
    }
  };

  if (loadingJob) {
    return <div className="p-6 text-center text-slate-600">Loading job...</div>;
  }

  if (!job) {
    return (
      <div className="p-6 text-center text-rose-600">
        We could not find this job. It may have been removed.
      </div>
    );
  }

  return (
    <div className="max-w-4xl p-6 mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Apply for {job.title}
        </h1>
        <p className="text-sm text-slate-500">
          {job.company_name || "Unknown company"} • Job #{jobId}
        </p>
      </div>

      <section className="p-6 space-y-4 bg-white border shadow-sm rounded-xl border-slate-200">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {job.title}
            </h2>
            <p className="text-sm text-slate-500">
              Posted {formatTime(job.created_at)} • Threshold{" "}
              {(job.coverage_threshold ?? 0.6) * 100}%
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
              job.published || job.status === "approved"
                ? "bg-emerald-100 text-emerald-700"
                : job.status === "rejected"
                ? "bg-rose-100 text-rose-600"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {job.published || job.status === "approved"
              ? "Published"
              : job.status || "Pending"}
          </span>
        </div>
        <div className="grid gap-3 text-sm md:grid-cols-3 text-slate-600">
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">
              HR email
            </div>
            <p className="mt-1">{job.hr_email || "(not provided)"}</p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">
              Attachment
            </div>
            {job.has_attachment ? (
              <button
                type="button"
                onClick={handleDownloadAttachment}
                className="mt-1 inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
                disabled={downloadBusy}
              >
                {downloadBusy
                  ? "Preparing..."
                  : job.attachment_name || "Download JD"}
              </button>
            ) : (
              <p className="mt-1">(no attachment)</p>
            )}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">
              Job ID
            </div>
            <p className="mt-1">#{jobId}</p>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">
            Job description
          </div>
          {jobDescriptionHtml ? (
            <div
              className="p-3 mt-2 text-sm border rounded-lg border-slate-100 bg-slate-50 text-slate-700 space-y-2 break-words [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_p]:mb-2 [&_li]:mb-1"
              dangerouslySetInnerHTML={{ __html: jobDescriptionHtml }}
            />
          ) : (
            <p className="p-3 mt-2 text-sm border rounded-lg border-slate-100 bg-slate-50 text-slate-700">
              (No description provided)
            </p>
          )}
        </div>
      </section>

      <section className="p-6 space-y-4 bg-white border shadow-sm rounded-xl border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">
          Upload or paste your CV
        </h2>
        <div className="space-y-3">
          <div>
            <label className="block mb-1 text-sm font-medium text-slate-700">
              CV file (PDF/DOC/DOCX)
            </label>
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              className="w-full text-sm file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-100"
              onChange={(e) =>
                setCvFile(
                  e.target.files && e.target.files[0] ? e.target.files[0] : null
                )
              }
            />
          </div>
          <div>
            <label className="block mb-1 text-sm font-medium text-slate-700">
              Or paste CV text
            </label>
            <RichTextEditor
              content={cvHtml}
              onChange={(value) => {
                setCvHtml(value);
                setCvText(htmlToPlainText(value));
              }}
              placeholder="Paste your CV content here..."
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white transition rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={runAnalysis}
            disabled={analyzing}
          >
            {analyzing ? "Analyzing..." : "Run AI Check"}
          </button>
          <button
            type="button"
            className="inline-flex items-center px-4 py-2 text-sm font-semibold transition bg-white border rounded-lg border-slate-200 text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleCancel}
            disabled={analyzing || applying}
          >
            Cancel
          </button>
          <button
            className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white transition bg-blue-600 rounded-lg hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={applyForJob}
            disabled={applying || !result}
          >
            {applying ? "Submitting..." : "Apply Job"}
          </button>
        </div>
        {err && (
          <div className="px-4 py-2 text-sm border rounded border-rose-200 bg-rose-50 text-rose-600">
            {err}
          </div>
        )}
        {notice && (
          <div className="px-4 py-2 text-sm border rounded border-emerald-200 bg-emerald-50 text-emerald-700">
            {notice}
          </div>
        )}
      </section>

      {result && (
        <section className="p-6 space-y-4 bg-white border shadow-sm rounded-xl border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Model screening result
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 border rounded-lg border-slate-200 bg-slate-50">
              <div className="text-xs font-semibold uppercase text-slate-500">
                Coverage score
              </div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {result.coverage?.toFixed(2)}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Required threshold: {(job.coverage_threshold ?? 0.6) * 100}%
              </p>
            </div>
            <div className="p-4 border rounded-lg border-slate-200 bg-slate-50">
              <div className="text-xs font-semibold uppercase text-slate-500">
                Similarity
              </div>
              <div className="mt-1 text-2xl font-semibold text-slate-900">
                {result.similarity?.toFixed(2)}
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Measures semantic similarity between your CV and the JD.
              </p>
            </div>
          </div>
          <div className="p-4 border rounded-lg border-slate-200 bg-slate-50">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold uppercase text-slate-500">
                  Overall decision
                </div>
                <div className="mt-1 text-lg font-semibold text-slate-900">
                  {result.passed
                    ? "Looks like a good fit!"
                    : "Below the current threshold."}
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                  result.passed
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {result.passed ? "Passed" : "Needs improvement"}
              </span>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Predicted role alignment: {result.predicted_role || "Unknown"}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1 text-sm font-medium text-slate-700">
                Matched skills
              </div>
              <div className="flex flex-wrap gap-2">
                {(result.matched || []).length === 0 ? (
                  <span className="text-sm text-slate-500">
                    No direct matches found.
                  </span>
                ) : (
                  (result.matched || []).map((skill: string, idx: number) => (
                    <span
                      key={`${skill}-${idx}`}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700"
                    >
                      {skill}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div>
              <div className="mb-1 text-sm font-medium text-slate-700">
                Missing skills
              </div>
              <div className="flex flex-wrap gap-2">
                {(result.missing || []).length === 0 ? (
                  <span className="text-sm text-slate-500">None 🎉</span>
                ) : (
                  (result.missing || []).map((skill: string, idx: number) => (
                    <span
                      key={`${skill}-${idx}`}
                      className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-rose-100 text-rose-700"
                    >
                      {skill}
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 border rounded-lg border-slate-200 bg-slate-50">
              <div className="text-sm font-semibold text-slate-800">
                CV quality checklist
              </div>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                {Array.isArray(result.quality_warnings) &&
                result.quality_warnings.length > 0 ? (
                  result.quality_warnings.map((warning: any, idx: number) => (
                    <div
                      key={`warning-${idx}`}
                      className="px-3 py-2 border rounded-lg border-amber-200 bg-amber-50"
                    >
                      <div className="text-xs font-semibold uppercase text-amber-600">
                        {warning.severity || "info"}
                      </div>
                      <div className="font-medium text-slate-900">
                        {warning.issue}
                      </div>
                      {warning.recommendation && (
                        <p className="mt-1 text-xs text-slate-600">
                          {warning.recommendation}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    Great job! No major issues detected.
                  </p>
                )}
              </div>
            </div>
            <div className="p-4 border rounded-lg border-slate-200 bg-slate-50">
              <div className="text-sm font-semibold text-slate-800">
                Recommended courses
              </div>
              <div className="mt-2 space-y-2 text-sm text-slate-700">
                {Array.isArray(result.course_suggestions) &&
                result.course_suggestions.length > 0 ? (
                  result.course_suggestions.map((course: any, idx: number) => (
                    <div
                      key={`course-${idx}`}
                      className="px-3 py-2 bg-white border rounded-lg border-slate-200"
                    >
                      <div className="font-medium text-slate-900">
                        {course.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        {course.provider || "Online"} •{" "}
                        {course.skill || "Skill upgrade"}
                      </div>
                      {course.url && (
                        <a
                          href={course.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex mt-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
                        >
                          View course →
                        </a>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">
                    No specific courses suggested. Keep polishing your skills!
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
