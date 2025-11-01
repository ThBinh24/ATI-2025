import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatTime } from "../lib/time";
import {
  banUser,
  unbanUser,
  listBannedUsers,
  listJobHistory,
  listPendingJobs,
  listUsers,
  updateJobStatus,
} from "../services/backend";

interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at?: string;
  is_banned?: number;
  banned_reason?: string;
  banned_at?: string;
}

interface PendingJob {
  id: number;
  title: string;
  company_name?: string;
  jd_text?: string;
  hr_email?: string;
  created_at?: string;
  coverage_threshold?: number;
  rejection_reason?: string;
}

interface JobHistoryEntry {
  id: number;
  title: string;
  company_name?: string;
  status: string;
  rejection_reason?: string;
  reviewed_at?: string;
  admin_name?: string;
  admin_email?: string;
  created_at?: string;
}

type AdminTab = "users" | "jobs" | "history";

const formatDate = (value?: string) => formatTime(value);

const extractErrorMessage = (err: any, fallback: string): string => {
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((entry) => {
        if (!entry) return "";
        if (typeof entry === "string") return entry;
        if (entry.msg) return entry.msg;
        return JSON.stringify(entry);
      })
      .filter(Boolean)
      .join("; ");
  }
  if (typeof detail === "object") {
    if (detail.msg) return detail.msg;
    if (detail.message) return detail.message;
    return JSON.stringify(detail);
  }
  return fallback;
};

const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>("users");

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pendingJobs, setPendingJobs] = useState<PendingJob[]>([]);
  const [bannedUsers, setBannedUsers] = useState<AdminUser[]>([]);
  const [jobHistory, setJobHistory] = useState<JobHistoryEntry[]>([]);

  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [errorUsers, setErrorUsers] = useState<string | null>(null);
  const [errorJobs, setErrorJobs] = useState<string | null>(null);
  const [errorHistory, setErrorHistory] = useState<string | null>(null);

  const [rejectNotes, setRejectNotes] = useState<Record<number, string>>({});
  const [actionBusy, setActionBusy] = useState<number | null>(null);
  const [banBusy, setBanBusy] = useState(false);
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [banReason, setBanReason] = useState("");
  const [banModalError, setBanModalError] = useState<string | null>(null);
  const [unbanBusy, setUnbanBusy] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.role !== "admin") {
      navigate("/");
      return;
    }
    fetchUsers();
    fetchPendingJobs();
    fetchHistory();
  }, [user, navigate]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    setErrorUsers(null);
    try {
      const res = await listUsers();
      setUsers(res.data || []);
    } catch (err: any) {
      setErrorUsers(extractErrorMessage(err, "Failed to load users."));
    } finally {
      setLoadingUsers(false);
    }

    try {
      const res = await listBannedUsers();
      setBannedUsers(res.data || []);
    } catch {
      // ignore banned fetch errors here; history tab shows message
    }
  };

  const fetchPendingJobs = async () => {
    setLoadingJobs(true);
    setErrorJobs(null);
    try {
      const res = await listPendingJobs();
      setPendingJobs(res.data || []);
    } catch (err: any) {
      setErrorJobs(extractErrorMessage(err, "Failed to load pending jobs."));
    } finally {
      setLoadingJobs(false);
    }
  };

  const fetchHistory = async () => {
    setLoadingHistory(true);
    setErrorHistory(null);
    try {
      const res = await listJobHistory();
      setJobHistory(res.data || []);
    } catch (err: any) {
      setErrorHistory(extractErrorMessage(err, "Failed to load job history."));
    }
    try {
      const res = await listBannedUsers();
      setBannedUsers(res.data || []);
    } catch (err: any) {
      setErrorHistory(
        (prev) =>
          prev ?? extractErrorMessage(err, "Failed to load banned users.")
      );
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleApprove = async (jobId: number) => {
    setActionBusy(jobId);
    try {
      await updateJobStatus(jobId, { status: "approved" });
      await Promise.all([fetchPendingJobs(), fetchHistory()]);
    } catch (err: any) {
      setErrorJobs(extractErrorMessage(err, "Failed to approve job."));
    } finally {
      setActionBusy(null);
    }
  };

  const handleReject = async (jobId: number) => {
    const note = (rejectNotes[jobId] || "").trim();
    if (!note) {
      setErrorJobs("Please provide a rejection reason.");
      return;
    }
    setActionBusy(jobId);
    try {
      await updateJobStatus(jobId, {
        status: "rejected",
        rejection_reason: note,
      });
      setRejectNotes((prev) => ({ ...prev, [jobId]: "" }));
      await Promise.all([fetchPendingJobs(), fetchHistory()]);
    } catch (err: any) {
      setErrorJobs(extractErrorMessage(err, "Failed to reject job."));
    } finally {
      setActionBusy(null);
    }
  };

  const openBanModal = (target: AdminUser) => {
    if (target.is_banned) return;
    setBanTarget(target);
    setBanReason("");
    setBanModalError(null);
  };

  const closeBanModal = () => {
    if (banBusy) return;
    setBanTarget(null);
    setBanReason("");
    setBanModalError(null);
  };

  const handleConfirmBan = async () => {
    if (!banTarget) return;
    const trimmed = banReason.trim();
    if (!trimmed) {
      setBanModalError("Ban reason is required.");
      return;
    }
    setBanBusy(true);
    setBanModalError(null);
    try {
      await banUser(banTarget.id, trimmed);
      await fetchUsers();
      await fetchHistory();
      closeBanModal();
    } catch (err: any) {
      setBanModalError(extractErrorMessage(err, "Failed to ban user."));
    } finally {
      setBanBusy(false);
    }
  };

  const handleUnbanUser = async (target: AdminUser) => {
    setUnbanBusy(target.id);
    setErrorUsers(null);
    try {
      await unbanUser(target.id);
      await fetchUsers();
      await fetchHistory();
    } catch (err: any) {
      setErrorUsers(extractErrorMessage(err, "Failed to unban user."));
    } finally {
      setUnbanBusy(null);
    }
  };

  const userRows = useMemo(
    () =>
      users.map((u, idx) => ({
        stt: idx + 1,
        ...u,
      })),
    [users]
  );

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Admin Control Center
          </h1>
          <p className="text-sm text-slate-500">
            Manage users, review job submissions, and audit previous decisions.
          </p>
        </div>
        <div className="flex p-1 bg-white border rounded-lg border-slate-200">
          {(["users", "jobs", "history"] as AdminTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === tab
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab === "users" && "Manage Users"}
              {tab === "jobs" && "Review Jobs"}
              {tab === "history" && "History"}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "users" && (
        <div className="bg-white border shadow-sm rounded-2xl border-slate-200">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">
              Registered Users
            </h2>
            <p className="text-sm text-slate-500">
              {userRows.length} account{userRows.length === 1 ? "" : "s"}{" "}
              present in the system.
            </p>
          </div>
          {loadingUsers ? (
            <div className="p-6 text-sm text-slate-500">Loading users...</div>
          ) : errorUsers ? (
            <div className="p-6 text-sm text-rose-500">{errorUsers}</div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full text-sm divide-y divide-slate-200">
                <thead className="font-medium text-left bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Full name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Created at</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {userRows.map((row) => (
                    <tr key={row.id} className="text-slate-700">
                      <td className="px-4 py-3">{row.stt}</td>
                      <td className="px-4 py-3">{row.name || "-"}</td>
                      <td className="px-4 py-3 text-slate-600">{row.email}</td>
                      <td className="px-4 py-3 capitalize">
                        {row.role}
                        {row.is_banned ? (
                          <span className="ml-2 inline-flex rounded-full bg-rose-100 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                            Banned
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        {row.is_banned ? (
                          <button
                            type="button"
                            className="px-3 py-1 text-xs font-medium transition border rounded-lg border-emerald-300 text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => handleUnbanUser(row)}
                            disabled={unbanBusy === row.id}
                          >
                            {unbanBusy === row.id ? "Unbanning..." : "Unban user"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="px-3 py-1 text-xs font-medium transition border rounded-lg border-slate-300 text-slate-600 hover:border-rose-400 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => openBanModal(row)}
                          >
                            Ban user
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {userRows.length === 0 && (
                    <tr>
                      <td
                        className="px-4 py-6 text-center text-slate-500"
                        colSpan={6}
                      >
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "jobs" && (
        <div className="bg-white border shadow-sm rounded-2xl border-slate-200">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-900">
              Pending job submissions
            </h2>
            <p className="text-sm text-slate-500">
              Review incoming roles before they surface to applicants.
            </p>
          </div>
          {loadingJobs ? (
            <div className="p-6 text-sm text-slate-500">
              Loading pending jobs...
            </div>
          ) : errorJobs ? (
            <div className="p-6 text-sm text-rose-500">{errorJobs}</div>
          ) : pendingJobs.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">
              No jobs awaiting review.
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {pendingJobs.map((job) => (
                <div
                  key={job.id}
                  className="p-6 border shadow-sm rounded-xl border-slate-200 bg-slate-50/80"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-semibold text-slate-900">
                        {job.title}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {job.company_name || "Unknown company"} • Submitted{" "}
                        {formatDate(job.created_at)}
                      </p>
                    </div>
                    <span className="px-3 py-1 text-xs font-medium uppercase rounded-full bg-amber-100 text-amber-700">
                      Pending
                    </span>
                  </div>

                  <div className="space-y-3 text-sm text-slate-700">
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">
                        Job description
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">
                        {job.jd_text || "(no description provided)"}
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">
                          HR contact
                        </div>
                        <p className="mt-1 text-slate-600">
                          {job.hr_email || "(not provided)"}
                        </p>
                      </div>
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">
                          Coverage threshold
                        </div>
                        <p className="mt-1 text-slate-600">
                          {(job.coverage_threshold ?? 0.6) * 100}% minimum match
                          required
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <label
                      className="text-xs font-semibold uppercase text-slate-500"
                      htmlFor={`reject_${job.id}`}
                    >
                      Rejection reason (required when rejecting)
                    </label>
                    <textarea
                      id={`reject_${job.id}`}
                      rows={3}
                      value={rejectNotes[job.id] ?? ""}
                      onChange={(e) => {
                        setErrorJobs(null);
                        setRejectNotes((prev) => ({
                          ...prev,
                          [job.id]: e.target.value,
                        }));
                      }}
                      className="w-full px-3 py-2 text-sm bg-white border rounded-lg border-slate-300 text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      placeholder="Provide context for rejection..."
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        className="px-4 py-2 text-sm font-semibold text-white transition rounded-lg shadow-sm bg-emerald-600 hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={actionBusy === job.id}
                        onClick={() => handleApprove(job.id)}
                      >
                        Approve job
                      </button>
                      <button
                        type="button"
                        className="px-4 py-2 text-sm font-semibold transition bg-white border rounded-lg shadow-sm border-rose-500 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                        disabled={actionBusy === job.id}
                        onClick={() => handleReject(job.id)}
                      >
                        Reject job
                      </button>
                      {actionBusy === job.id && (
                        <span className="text-xs text-slate-500">
                          Submitting decision...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="space-y-6">
          <div className="bg-white border shadow-sm rounded-2xl border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">
                User Ban History
              </h2>
              <p className="text-sm text-slate-500">
                Recent users removed from the platform and associated reasons.
              </p>
            </div>
            {loadingHistory ? (
              <div className="p-6 text-sm text-slate-500">
                Loading history...
              </div>
            ) : errorHistory ? (
              <div className="p-6 text-sm text-rose-500">{errorHistory}</div>
            ) : bannedUsers.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                No banned users recorded.
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm divide-y divide-slate-200">
                  <thead className="font-medium text-left bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Banned at</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bannedUsers.map((entry) => (
                      <tr key={entry.id} className="text-slate-700">
                        <td className="px-4 py-3">{entry.name || "-"}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {entry.email}
                        </td>
                        <td className="px-4 py-3 capitalize">{entry.role}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {entry.banned_reason || "(not provided)"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatDate(entry.banned_at)}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="px-3 py-1 text-xs font-medium transition border rounded-lg border-emerald-300 text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => handleUnbanUser(entry)}
                          disabled={unbanBusy === entry.id}
                        >
                          {unbanBusy === entry.id ? "Unbanning..." : "Unban"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}
          </div>

          <div className="bg-white border shadow-sm rounded-2xl border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-slate-900">
                Job Review History
              </h2>
              <p className="text-sm text-slate-500">
                Log of approvals and rejections performed by administrators.
              </p>
            </div>
            {loadingHistory ? (
              <div className="p-6 text-sm text-slate-500">
                Loading history...
              </div>
            ) : jobHistory.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                No review decisions recorded.
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm divide-y divide-slate-200">
                  <thead className="font-medium text-left bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Job</th>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Decision</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">Reviewed by</th>
                      <th className="px-4 py-3">Reviewed at</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {jobHistory.map((entry) => (
                      <tr
                        key={`${entry.id}-${entry.reviewed_at}`}
                        className="text-slate-700"
                      >
                        <td className="px-4 py-3">{entry.title}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {entry.company_name || "-"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-[2px] text-xs font-semibold uppercase ${
                              entry.status === "approved"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-rose-100 text-rose-600"
                            }`}
                          >
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {entry.rejection_reason
                            ? entry.rejection_reason
                            : entry.status === "approved"
                            ? "Approved"
                            : "(not provided)"}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {entry.admin_name || "Unknown"}
                          {entry.admin_email ? ` (${entry.admin_email})` : ""}
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          {formatDate(entry.reviewed_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      {banTarget && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center px-4 bg-slate-900/50 backdrop-blur-sm"
          style={{ marginTop: 0 }}
        >
          <div className="w-full max-w-md p-6 bg-white shadow-xl rounded-2xl">
            <h3 className="text-lg font-semibold text-slate-900">Ban user</h3>
            <p className="mt-2 text-sm text-slate-600">
              Provide a reason for banning{" "}
              <span className="font-medium text-slate-800">
                {banTarget.name || banTarget.email}
              </span>
              . This action restricts the account immediately.
            </p>
            <div className="mt-4 space-y-2">
              <label
                className="text-sm font-medium text-slate-700"
                htmlFor="ban-reason"
              >
                Ban reason
              </label>
              <textarea
                id="ban-reason"
                rows={4}
                value={banReason}
                onChange={(e) => {
                  setBanModalError(null);
                  setBanReason(e.target.value);
                }}
                className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 text-slate-700 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-400/30"
                placeholder="Explain why this user is being banned..."
              />
              {banModalError && (
                <p className="text-sm text-rose-500">{banModalError}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium transition border rounded-lg border-slate-300 text-slate-600 hover:bg-slate-100"
                onClick={closeBanModal}
                disabled={banBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold text-white transition rounded-lg shadow-sm bg-rose-600 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleConfirmBan}
                disabled={banBusy}
              >
                {banBusy ? "Banning..." : "Ban user"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
