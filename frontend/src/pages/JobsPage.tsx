import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  deleteJob as deleteJobApi,
  downloadJobAttachment,
  downloadMyApplicationCv,
  listJobs,
  listMyApplications,
} from "../services/backend";
import { useAuth } from "../context/AuthContext";
import { formatTime } from "../lib/time";

const JobsPage: React.FC = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingApplications, setLoadingApplications] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingJobId, setDownloadingJobId] = useState<number | null>(null);
  const [jobPendingDelete, setJobPendingDelete] = useState<any | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [detailsModal, setDetailsModal] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"list" | "applied">("list");
  const [downloadingCvId, setDownloadingCvId] = useState<number | null>(null);
  const { user } = useAuth();

  useEffect(() => {
    if (user?.role === "admin") {
      navigate("/admin", { replace: true });
      return;
    }
    setLoadingJobs(true);
    listJobs()
      .then((res) => setJobs(res.data || []))
      .catch((err) =>
        setError(err?.response?.data?.detail || "Failed to load jobs.")
      )
      .finally(() => setLoadingJobs(false));
  }, []);

  useEffect(() => {
    if (user?.role === "student") {
      setLoadingApplications(true);
      listMyApplications()
        .then((res) => setApplications(res.data || []))
        .catch((err) =>
          setError(
            err?.response?.data?.detail || "Failed to load your applications."
          )
        )
        .finally(() => setLoadingApplications(false));
    }
  }, [user]);

  const appliedJobIds = useMemo(() => {
    if (!applications || applications.length === 0) {
      return new Set<number>();
    }
    const ids = new Set<number>();
    applications.forEach((record: any) => {
      if (record.job_id) {
        ids.add(Number(record.job_id));
      }
    });
    return ids;
  }, [applications]);

  const handleDownloadAttachment = async (job: any) => {
    if (!job?.has_attachment) return;
    try {
      setError(null);
      setDownloadingJobId(job.id);
      const response = await downloadJobAttachment(job.id);
      const blobUrl = window.URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = job.attachment_name || `job-${job.id}-attachment`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "Failed to download the attachment. Please try again."
      );
    } finally {
      setDownloadingJobId(null);
    }
  };

  const openDeleteModal = (job: any) => {
    setError(null);
    setJobPendingDelete(job);
  };

  const closeDeleteModal = () => {
    if (deleteBusy) return;
    setJobPendingDelete(null);
  };

  const downloadSubmittedCv = async (application: any) => {
    if (!application?.id || !application?.uploaded_file_path) {
      setError("CV file is not available for download.");
      return;
    }
    try {
      setError(null);
      setDownloadingCvId(application.id);
      const response = await downloadMyApplicationCv(application.id);
      const blobUrl = window.URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      const preferredName =
        (application.uploaded_filename || "").trim() ||
        `application-${application.id}.pdf`;
      anchor.download = preferredName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "Failed to download the submitted CV. Please try again."
      );
    } finally {
      setDownloadingCvId(null);
    }
  };

  const confirmDeleteJob = async () => {
    if (!jobPendingDelete) return;
    try {
      setError(null);
      setDeleteBusy(true);
      await deleteJobApi(jobPendingDelete.id);
      setJobs((prev) => prev.filter((item) => item.id !== jobPendingDelete.id));
      setJobPendingDelete(null);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "Failed to delete the job. Please try again."
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  if (loadingJobs) {
    return <div>Loading jobs...</div>;
  }

  const jobCards = (jobList: any[]) => (
    <div className="grid gap-4 md:grid-cols-3">
      {jobList.map((job) => (
        <div
          key={job.id}
          className="flex flex-col h-full p-4 bg-white border shadow-sm rounded-xl border-slate-200"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {job.title}
              </h2>
              <p className="text-sm text-slate-500">{job.company_name}</p>
            </div>
            {user?.role !== "student" && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${
                  job.published || job.status === "approved"
                    ? "bg-emerald-100 text-emerald-700"
                    : job.status === "rejected"
                    ? "bg-rose-100 text-rose-600"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {job.published || job.status === "approved"
                  ? "Published"
                  : job.status
                  ? job.status
                  : "Pending"}
              </span>
            )}
          </div>
          <p className="mt-3 overflow-hidden text-sm whitespace-pre-line text-slate-600 max-h-32">
            {job.jd_text || "(No JD provided)"}
          </p>
          <div className="mt-4 space-y-2">
            {job.has_attachment && (
              <button
                type="button"
                className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                onClick={() => handleDownloadAttachment(job)}
                disabled={downloadingJobId === job.id}
              >
                {downloadingJobId === job.id
                  ? "Downloading..."
                  : job.attachment_name
                  ? `Download ${job.attachment_name}`
                  : "Download attachment"}
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-4 mt-auto">
            {user?.role === "student" && (
              <Link
                className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
                to={`/jobs/${job.id}/apply`}
              >
                Apply / Analyze CV
              </Link>
            )}
            {user?.role === "employer" && (
              <>
                <Link
                  className="inline-flex items-center rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
                  to={`/jobs/${job.id}/applicants`}
                >
                  View applicants
                </Link>
                <Link
                  className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700"
                  to={`/jobs/${job.id}/edit`}
                >
                  Edit
                </Link>
                <button
                  type="button"
                  className="inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700"
                  onClick={() => openDeleteModal(job)}
                >
                  Delete
                </button>
              </>
            )}
            {user?.role === "admin" && (
              <Link
                className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700"
                to={`/jobs/${job.id}/edit`}
              >
                Edit
              </Link>
            )}
          </div>
        </div>
      ))}
      {jobList.length === 0 && (
        <div className="p-6 text-sm text-center bg-white border border-dashed rounded-xl border-slate-300 text-slate-500">
          No jobs available yet.
        </div>
      )}
    </div>
  );

  const appliedCards = (
    <div className="grid gap-4 md:grid-cols-3">
      {applications.map((record: any) => (
        <div
          key={record.id}
          className="flex flex-col h-full p-4 bg-white border shadow-sm rounded-xl border-slate-200"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">
                {record.job_title_full || record.job_title || "Job"}
              </h2>
              <p className="text-sm text-slate-500">
                {record.job_company || "Unknown company"}
              </p>
            </div>
            {Boolean(record.passed) && (
              <span className="rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide bg-emerald-100 text-emerald-700">
                Passed
              </span>
            )}
          </div>
          <div className="mt-3 space-y-1 text-sm text-slate-600">
            <div>
              <span className="font-medium">Applied:</span>{" "}
              {formatTime(record.created_at)}
            </div>
            <div>
              <span className="font-medium">Coverage:</span>{" "}
              {Number.isFinite(record.coverage)
                ? Number(record.coverage).toFixed(2)
                : record.coverage}
            </div>
            <div>
              <span className="font-medium">Similarity:</span>{" "}
              {Number.isFinite(record.similarity)
                ? Number(record.similarity).toFixed(2)
                : record.similarity}
            </div>
          </div>
          <div className="flex gap-2 pt-4 mt-auto">
            <button
              type="button"
              className="inline-flex items-center rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-slate-800"
              onClick={() => setDetailsModal(record)}
            >
              View detail
            </button>
            {record.job_id && (
              <Link
                className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700"
                to={`/jobs/${record.job_id}/apply`}
              >
                Apply again
              </Link>
            )}
          </div>
        </div>
      ))}
      {applications.length === 0 && (
        <div className="p-6 text-sm text-center bg-white border border-dashed rounded-xl border-slate-300 text-slate-500">
          You have not applied to any jobs yet.
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">
            Job listings
          </h1>
          <p className="text-sm text-slate-500">
            {user?.role === "employer"
              ? "Manage the openings you submitted and track applicants."
              : "Browse openings curated for you."}
          </p>
        </div>
        {(user?.role === "admin" || user?.role === "employer") && (
          <Link
            className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white transition bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700"
            to="/jobs/new"
          >
            Create job
          </Link>
        )}
      </div>
      {error && (
        <div className="px-4 py-2 text-sm border rounded border-rose-200 bg-rose-50 text-rose-700">
          {error}
        </div>
      )}
      {user?.role === "student" ? (
        <>
          <div className="flex items-center gap-2 border-b border-slate-200">
            <button
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === "list"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setActiveTab("list")}
            >
              Job list
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === "applied"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setActiveTab("applied")}
              disabled={loadingApplications}
            >
              Jobs applied
            </button>
          </div>
          <div className="pt-4">
            {activeTab === "list" &&
              jobCards(
                jobs.filter((job) => !appliedJobIds.has(Number(job.id)))
              )}
            {activeTab === "applied" &&
              (loadingApplications ? (
                <div>Loading your applications...</div>
              ) : (
                appliedCards
              ))}
          </div>
        </>
      ) : (
        jobCards(jobs)
      )}
      {jobPendingDelete && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center px-4 mt-0 bg-slate-900/50 backdrop-blur-sm"
          style={{ marginTop: 0 }}
        >
          <div className="w-full max-w-md p-6 bg-white shadow-xl rounded-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Delete job</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete{" "}
              <span className="font-medium text-slate-800">
                {jobPendingDelete.title}
              </span>
              ? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium transition border rounded-lg border-slate-300 text-slate-600 hover:bg-slate-100"
                onClick={closeDeleteModal}
                disabled={deleteBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold text-white transition rounded-lg shadow-sm bg-rose-600 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={confirmDeleteJob}
                disabled={deleteBusy}
              >
                {deleteBusy ? "Deleting..." : "Delete job"}
              </button>
            </div>
          </div>
        </div>
      )}
      {detailsModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center px-4 bg-slate-900/50 backdrop-blur-sm"
          style={{ marginTop: 0 }}
        >
          <div className="w-full max-w-2xl p-6 overflow-hidden bg-white shadow-xl rounded-2xl">
            <div className="max-h-[90vh] overflow-y-auto pr-6">
              <h3 className="text-lg font-semibold text-slate-900">
                Application detail
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Applied on {formatTime(detailsModal.created_at)}
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-700">
                <div>
                  <span className="font-semibold text-slate-800">Job:</span>{" "}
                  {detailsModal.job_title_full || detailsModal.job_title}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Company:</span>{" "}
                  {detailsModal.job_company || "Unknown"}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <span className="font-semibold text-slate-800">
                      Coverage
                    </span>
                    :{" "}
                    {Number.isFinite(detailsModal.coverage)
                      ? Number(detailsModal.coverage).toFixed(2)
                      : detailsModal.coverage}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800">
                      Similarity
                    </span>
                    :{" "}
                    {Number.isFinite(detailsModal.similarity)
                      ? Number(detailsModal.similarity).toFixed(2)
                      : detailsModal.similarity}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800">Status</span>
                    : {detailsModal.passed ? "Passed" : "Needs improvement"}
                  </div>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">
                    Missing skills
                  </span>
                  : {detailsModal.missing || "None"}
                </div>
                <div>
                  <span className="font-semibold text-slate-800">CV text</span>
                  <div className="p-3 mt-1 text-xs whitespace-pre-wrap border rounded-lg border-slate-200 bg-slate-50 text-slate-700">
                    {detailsModal.cv_text ||
                      "(No CV text captured. You may have uploaded a file only.)"}
                  </div>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">
                    Uploaded file
                  </span>
                  <div className="mt-1">
                    {detailsModal.uploaded_file_path ? (
                      <button
                        type="button"
                        className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                        onClick={() => downloadSubmittedCv(detailsModal)}
                        disabled={downloadingCvId === detailsModal.id}
                      >
                        {downloadingCvId === detailsModal.id
                          ? "Preparing..."
                          : `Download ${detailsModal.uploaded_filename}`}
                      </button>
                    ) : (
                      <div className="p-3 mt-1 text-xs whitespace-pre-wrap border rounded-lg text-slate-500 border-slate-200 bg-slate-50">
                        (No CV uploaded)
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">
                    Job description
                  </span>
                  <div className="p-3 mt-1 text-xs whitespace-pre-wrap border rounded-lg border-slate-200 bg-slate-50 text-slate-700">
                    {detailsModal.job_jd_text ||
                      "(Job description not available.)"}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  className="px-4 py-2 text-sm font-medium transition border rounded-lg border-slate-300 text-slate-600 hover:bg-slate-100"
                  onClick={() => setDetailsModal(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobsPage;
