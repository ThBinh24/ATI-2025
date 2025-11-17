import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  deleteJob as deleteJobApi,
  downloadJobAttachment,
  downloadMyApplicationCv,
  deleteMyApplication,
  listJobs,
  listMyApplications,
  listJobsMatchedToProfile,
  listProfileMatchHistory,
  clearProfileMatchHistory,
} from "../services/backend";
import { useAuth } from "../context/AuthContext";
import { formatTime } from "../lib/time";
import { sanitizeHtml } from "../lib/sanitize";

function renderHtml(
  value: string | null | undefined,
  fallback: string,
  className: string,
) {
  const sanitized = sanitizeHtml(value);
  if (!sanitized) {
    return <div className={className}>{fallback}</div>;
  }
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}

const extractErrorMessage = (err: any, fallback: string) => {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item === "string" ? item : item?.msg || JSON.stringify(item)))
      .join("; ");
  }
  if (typeof detail === "object") {
    return detail.msg || detail.error || JSON.stringify(detail);
  }
  return fallback;
};

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
  const [activeTab, setActiveTab] = useState<"list" | "applied" | "history">("list");
  const [downloadingCvId, setDownloadingCvId] = useState<number | null>(null);
  const [deletingApplicationId, setDeletingApplicationId] = useState<number | null>(null);
  const [applicationPendingDelete, setApplicationPendingDelete] = useState<any | null>(null);
  const [useProfileFilter, setUseProfileFilter] = useState(false);
  const [matchedJobs, setMatchedJobs] = useState<any[]>([]);
  const [matching, setMatching] = useState(false);
  const [profileFilterError, setProfileFilterError] = useState<string | null>(null);
  const [matchHistory, setMatchHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [historySort, setHistorySort] = useState<{
    field: "score" | "coverage" | "title";
    direction: "asc" | "desc";
  }>({ field: "score", direction: "desc" });
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
        setError(extractErrorMessage(err, "Failed to load jobs."))
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
            extractErrorMessage(err, "Failed to load your applications.")
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
        extractErrorMessage(
          err,
          "Failed to download the attachment. Please try again."
        )
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
        extractErrorMessage(
          err,
          "Failed to download the submitted CV. Please try again."
        )
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
        extractErrorMessage(
          err,
          "Failed to delete the job. Please try again."
        )
      );
    } finally {
      setDeleteBusy(false);
    }
  };

  const openApplicationDeleteModal = (application: any) => {
    setError(null);
    setApplicationPendingDelete(application);
  };

  const closeApplicationDeleteModal = () => {
    setApplicationPendingDelete(null);
  };

  const handleDeleteApplication = async () => {
    if (!applicationPendingDelete?.id) return;
    const application = applicationPendingDelete;
    try {
      setDeletingApplicationId(application.id);
      await deleteMyApplication(application.id);
      setApplications((prev) => prev.filter((item) => item.id !== application.id));
      setError(null);
      setApplicationPendingDelete(null);
    } catch (err: any) {
      setError(
        extractErrorMessage(
          err,
          "Failed to delete this application. Please try again."
        )
      );
    } finally {
      setDeletingApplicationId(null);
    }
  };

  const fetchProfileMatches = async () => {
    try {
      setMatching(true);
      setProfileFilterError(null);
      const res = await listJobsMatchedToProfile();
      setMatchedJobs(res.data || []);
      setUseProfileFilter(true);
      fetchMatchHistory();
    } catch (err: any) {
      setProfileFilterError(
        extractErrorMessage(
          err,
          "Unable to match jobs with your profile. Please ensure you have an active CV."
        )
      );
      setUseProfileFilter(false);
    } finally {
      setMatching(false);
    }
  };

  const fetchMatchHistory = async () => {
    if (user?.role !== "student") return;
    try {
      setLoadingHistory(true);
      const res = await listProfileMatchHistory();
      setMatchHistory(res.data || []);
    } catch (err: any) {
      console.error("Failed to load history", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleRefreshMatches = async () => {
    setProfileFilterError(null);
    setMatchedJobs([]);
    await fetchProfileMatches();
  };

  const handleClearHistory = async () => {
    try {
      setClearingHistory(true);
      await clearProfileMatchHistory();
      setMatchHistory([]);
      setMatchedJobs([]);
      setUseProfileFilter(false);
    } catch (err: any) {
      setProfileFilterError(
        extractErrorMessage(err, "Failed to clear history. Please try again.")
      );
    } finally {
      setClearingHistory(false);
    }
  };

  const handleToggleProfileFilter = async () => {
    if (useProfileFilter) {
      setUseProfileFilter(false);
      setProfileFilterError(null);
      return;
    }
    await fetchProfileMatches();
  };

  useEffect(() => {
    if (user?.role !== "student") {
      setUseProfileFilter(false);
      setMatchedJobs([]);
      setMatchHistory([]);
    }
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === "student") {
      fetchMatchHistory();
    }
  }, [user?.role]);

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
            {user?.role === "student" ? (
              job.match ? (
                <div className="text-right">
                  <p className="text-xs font-semibold text-blue-600">
                    Match {Math.round((job.match.score || 0) * 100)}%
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Coverage {Math.round((job.match.coverage || 0) * 100)}%
                  </p>
                </div>
              ) : null
            ) : (
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
          {renderHtml(
            job.jd_text,
            "(No JD provided)",
            "mt-3 text-sm text-slate-600 max-h-32 overflow-hidden break-words space-y-2 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_p]:mb-2 [&_li]:mb-1",
          )}
          {job.match && user?.role === "student" && (
            <div className="mt-2 text-xs text-slate-500">
              Missing skills:{" "}
              {job.match.missing && job.match.missing.length > 0
                ? job.match.missing.slice(0, 3).join(", ")
                : "None"}
            </div>
          )}
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
            <button
              type="button"
              className="inline-flex items-center rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
              onClick={() => openApplicationDeleteModal(record)}
            >
              Delete
            </button>
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

  const baseJobList =
    user?.role === "student"
      ? jobs.filter((job) => !appliedJobIds.has(Number(job.id)))
      : jobs;
  const baseMatchedList =
    user?.role === "student"
      ? matchedJobs.filter((job) => !appliedJobIds.has(Number(job.id)))
      : matchedJobs;
  const displayedJobs =
    useProfileFilter && user?.role === "student"
      ? baseMatchedList
      : baseJobList;

  const sortedMatchHistory = [...matchHistory].sort((a, b) => {
    const dir = historySort.direction === "asc" ? 1 : -1;
    if (historySort.field === "title") {
      const titleA = (a.job?.title || "").toLowerCase();
      const titleB = (b.job?.title || "").toLowerCase();
      return titleA.localeCompare(titleB) * dir;
    }
    const valueA = Number(a.match?.[historySort.field] || 0);
    const valueB = Number(b.match?.[historySort.field] || 0);
    if (valueA === valueB) return 0;
    return valueA > valueB ? dir : -dir;
  });

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
            <button
              className={`px-4 py-2 text-sm font-medium transition ${
                activeTab === "history"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-slate-500 hover:text-slate-700"
              }`}
              onClick={() => setActiveTab("history")}
            >
              Match history
            </button>
          </div>
          <div className="pt-4 space-y-4">
            {activeTab === "list" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      onChange={handleToggleProfileFilter}
                      checked={useProfileFilter}
                      disabled={matching}
                    />
                    Use my active CV to prioritize jobs
                  </label>
                  {useProfileFilter && (
                    <button
                      type="button"
                      className="inline-flex items-center rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                      onClick={handleRefreshMatches}
                      disabled={matching}
                    >
                      {matching ? "Matching..." : "Refresh matches"}
                    </button>
                  )}
                </div>
                {profileFilterError && (
                  <div className="px-3 py-2 text-sm border rounded border-amber-200 bg-amber-50 text-amber-700">
                    {profileFilterError}
                  </div>
                )}
                {useProfileFilter && !matching && displayedJobs.length === 0 && (
                  <div className="p-4 text-sm text-center text-slate-500 bg-white border rounded-xl border-slate-200">
                    No recommended jobs available yet. Try refreshing or using another CV.
                  </div>
                )}
                {matching ? (
                  <div>Matching jobs with your profile...</div>
                ) : (
                  jobCards(displayedJobs)
                )}
              </div>
            )}
            {activeTab === "applied" &&
              (loadingApplications ? (
                <div>Loading your applications...</div>
              ) : (
                appliedCards
              ))}
            {activeTab === "history" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-slate-800">
                      Match history
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span>Sort by</span>
                      <select
                        className="px-2 py-1 border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none"
                        value={`${historySort.field}:${historySort.direction}`}
                        onChange={(e) => {
                          const [field, direction] = e.target.value.split(":");
                          setHistorySort({
                            field: field as "score" | "coverage" | "title",
                            direction: direction as "asc" | "desc",
                          });
                        }}
                      >
                        <option value="score:desc">Match score (high → low)</option>
                        <option value="score:asc">Match score (low → high)</option>
                        <option value="coverage:desc">Coverage (high → low)</option>
                        <option value="coverage:asc">Coverage (low → high)</option>
                        <option value="title:asc">Title (A → Z)</option>
                        <option value="title:desc">Title (Z → A)</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                      onClick={fetchMatchHistory}
                      disabled={loadingHistory}
                    >
                      {loadingHistory ? "Loading..." : "Refresh history"}
                    </button>
                    {matchHistory.length > 0 && (
                      <button
                        type="button"
                        className="inline-flex items-center rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-60"
                        onClick={handleClearHistory}
                        disabled={clearingHistory}
                      >
                        {clearingHistory ? "Clearing..." : "Clear history"}
                      </button>
                    )}
                  </div>
                </div>
                {loadingHistory ? (
                  <div className="text-sm text-slate-500">Loading history...</div>
                ) : matchHistory.length === 0 ? (
                  <div className="p-4 text-sm text-center text-slate-500 bg-white border rounded-xl border-slate-200">
                    No match history yet. Run the matcher to see previous results.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sortedMatchHistory.map((entry) => (
                      <div
                        key={`${entry.job?.id}-${entry.matched_at}`}
                        className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border rounded-xl border-slate-200"
                      >
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {entry.job?.title || "Job"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {entry.job?.company_name || "Unknown company"}
                          </p>
                          {(entry.cv_label || entry.cv_source) && (
                            <p className="text-[11px] text-slate-500">
                              CV: {entry.cv_label || "Unnamed"}
                              {entry.cv_source?.startsWith("uploaded")
                                ? " · Uploaded file"
                                : entry.cv_source?.startsWith("draft")
                                ? " · AI draft"
                                : ""}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-400">
                            Matched at {formatTime(entry.matched_at)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-blue-600">
                            Match {Math.round((entry.match?.score || 0) * 100)}%
                          </p>
                          <p className="text-xs text-slate-500">
                            Coverage {Math.round((entry.match?.coverage || 0) * 100)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        jobCards(displayedJobs)
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
      {applicationPendingDelete && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center px-4 bg-slate-900/50 backdrop-blur-sm"
          style={{ marginTop: 0 }}
        >
          <div className="w-full max-w-md p-6 bg-white shadow-xl rounded-2xl">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-slate-900">Remove application</h3>
              <p className="text-sm text-slate-600">
                This removes the application for{" "}
                <span className="font-semibold text-slate-900">
                  {applicationPendingDelete.job_title_full ||
                    applicationPendingDelete.job_title ||
                    "this job"}
                </span>{" "}
                from your history. You will need to re-apply if you change your mind.
              </p>
            </div>
            <div className="p-3 mt-4 text-sm border rounded-lg border-slate-200 bg-slate-50">
              <p className="text-slate-600">
                Applied on {formatTime(applicationPendingDelete.created_at)} • Coverage{" "}
                {Number.isFinite(applicationPendingDelete.coverage)
                  ? Number(applicationPendingDelete.coverage).toFixed(2)
                  : applicationPendingDelete.coverage}
              </p>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium transition border rounded-lg border-slate-300 text-slate-600 hover:bg-slate-100"
                onClick={closeApplicationDeleteModal}
                disabled={deletingApplicationId === applicationPendingDelete.id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold text-white transition rounded-lg shadow-sm bg-rose-600 hover:bg-rose-700 disabled:opacity-60"
                onClick={handleDeleteApplication}
                disabled={deletingApplicationId === applicationPendingDelete.id}
              >
                {deletingApplicationId === applicationPendingDelete.id ? "Removing..." : "Delete"}
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
                  {sanitizeHtml(detailsModal.cv_text) ? (
                    <div
                      className="p-3 mt-1 text-xs border rounded-lg border-slate-200 bg-slate-50 text-slate-700 space-y-2 break-words [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_p]:mb-2 [&_li]:mb-1"
                      dangerouslySetInnerHTML={{
                        __html: sanitizeHtml(detailsModal.cv_text),
                      }}
                    />
                  ) : (
                    <div className="p-3 mt-1 text-xs whitespace-pre-wrap border rounded-lg border-slate-200 bg-slate-50 text-slate-700">
                      (No CV text captured. You may have uploaded a file only.)
                    </div>
                  )}
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
                  {renderHtml(
                    detailsModal.job_jd_text,
                    "(Job description not available.)",
                    "p-3 mt-1 text-xs border rounded-lg border-slate-200 bg-slate-50 text-slate-700 space-y-2 break-words [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_p]:mb-2 [&_li]:mb-1",
                  )}
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
