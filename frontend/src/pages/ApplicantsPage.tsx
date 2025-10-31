import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  downloadApplicantCv,
  downloadJobAttachment,
  getJob,
  listApplicants,
  sendApplicantInvite,
} from "../services/backend";
import { formatTime } from "../lib/time";

const ApplicantsPage: React.FC = () => {
  const { id } = useParams();
  const jobId = Number(id);
  const [job, setJob] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [minCoverage, setMinCoverage] = useState<number | "">("");
  const [onlyPassed, setOnlyPassed] = useState(false);
  const [sortBy, setSortBy] = useState<"created_at" | "coverage">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [downloadingAttachment, setDownloadingAttachment] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [inviteCandidate, setInviteCandidate] = useState<any | null>(null);
  const [inviteSubject, setInviteSubject] = useState("");
  const [inviteBody, setInviteBody] = useState("");
  const [attachJobDescription, setAttachJobDescription] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [cvDetail, setCvDetail] = useState<any | null>(null);
  const [downloadingCvId, setDownloadingCvId] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    Promise.all([
      getJob(jobId)
        .then((r) => r.data)
        .catch(() => null),
      listApplicants(jobId)
        .then((r) => r.data)
        .catch(() => []),
    ])
      .then(([jobData, applicants]) => {
        if (!mounted) return;
        setJob(jobData);
        setRows(Array.isArray(applicants) ? applicants : []);
      })
      .catch((err) =>
        setError(err?.response?.data?.detail || "Failed to load applicants.")
      )
      .finally(() => setLoading(false));
    return () => {
      mounted = false;
    };
  }, [jobId]);

  const handleAttachmentDownload = async () => {
    if (!job?.has_attachment) return;
    try {
      setError(null);
      setDownloadingAttachment(true);
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
      setDownloadingAttachment(false);
    }
  };

  const handleDownloadApplicantCv = async (row: any) => {
    if (!row?.id || !row?.uploaded_file_path) {
      setError("This applicant did not upload a CV file.");
      return;
    }
    try {
      setError(null);
      setDownloadingCvId(row.id);
      const response = await downloadApplicantCv(row.id);
      const blobUrl = window.URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      const fallbackName =
        (row.uploaded_filename && String(row.uploaded_filename).trim()) ||
        `applicant-${row.id}.pdf`;
      anchor.download = fallbackName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to download the applicant CV. Please try again.";
      setError(detail);
    } finally {
      setDownloadingCvId(null);
    }
  };

  const openInviteModal = (candidate: any) => {
    if (!candidate?.email) {
      setError("Cannot send invite because the applicant email is missing.");
      return;
    }
    if (candidate?.invite_sent_at) {
      return;
    }
    const defaultSubject = `Interview invitation - ${
      job?.title || "CV Matcher"
    }`;
    const greetingName =
      candidate.name ||
      (candidate.email ? candidate.email.split("@")[0] : "there");
    const company = job?.company_name || "our team";
    const defaultBody = `Hi ${greetingName},\n\nThank you for applying for ${
      job?.title || "the role"
    } at ${company}. We'd love to invite you for the next step in our hiring process.\n\nPlease reply with a few time slots that work for you and we will confirm the interview schedule.\n\nBest regards,\n${company}`;

    setInviteCandidate(candidate);
    setInviteSubject(defaultSubject);
    setInviteBody(defaultBody);
    setAttachJobDescription(Boolean(job?.has_attachment));
    setInviteError(null);
  };

  const closeInviteModal = () => {
    if (sendingInvite) return;
    setInviteCandidate(null);
    setInviteSubject("");
    setInviteBody("");
    setInviteError(null);
  };

  const handleSendInvite = async () => {
    if (!inviteCandidate) return;
    const subject = inviteSubject.trim();
    const body = inviteBody.trim();
    if (!subject || !body) {
      setInviteError("Subject and body are required.");
      return;
    }

    setInviteError(null);
    setNotice(null);
    setSendingInvite(true);
    try {
      const response = await sendApplicantInvite(inviteCandidate.id, {
        subject,
        body,
        attach_jd: attachJobDescription && Boolean(job?.has_attachment),
      });
      const updated = response.data?.applicant;
      if (updated?.id) {
        setRows((prev) =>
          prev.map((row) =>
            row.id === updated.id ? { ...row, ...updated } : row
          )
        );
      }
      setNotice("Interview invitation sent successfully.");
      setInviteCandidate(null);
    } catch (err: any) {
      setInviteError(
        err?.response?.data?.detail ||
          "Failed to send the interview invite. Please check your email configuration and try again."
      );
    } finally {
      setSendingInvite(false);
    }
  };

  const filteredRows = useMemo(() => {
    const qNorm = query.trim().toLowerCase();
    return rows
      .filter((row: any) => {
        if (onlyPassed && !row.passed) return false;
        if (
          minCoverage !== "" &&
          typeof row.coverage === "number" &&
          row.coverage < (minCoverage as number)
        ) {
          return false;
        }
        if (!qNorm) return true;
        const haystack = `${row.name || ""} ${row.email || ""} ${
          row.missing || ""
        }`.toLowerCase();
        return haystack.includes(qNorm);
      })
      .sort((a: any, b: any) => {
        let va: number;
        let vb: number;
        if (sortBy === "coverage") {
          va = typeof a.coverage === "number" ? a.coverage : 0;
          vb = typeof b.coverage === "number" ? b.coverage : 0;
        } else {
          va = new Date(a.created_at || 0).getTime();
          vb = new Date(b.created_at || 0).getTime();
        }
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [rows, query, onlyPassed, minCoverage, sortBy, sortDir]);

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Applicants</h1>
        <p className="text-sm text-slate-500">
          Job #{jobId} • {job?.title || "Unknown role"} at{" "}
          {job?.company_name || "N/A"}
        </p>
      </div>
      {job && (
        <div className="p-5 space-y-3 bg-white border shadow-sm rounded-xl border-slate-200">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {job.title}
              </h2>
              <p className="text-sm text-slate-500">
                {job.company_name || "Unknown company"} • Created{" "}
                {formatTime(job.created_at, "recently")}
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
                : job.status
                ? job.status
                : "Pending"}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">
                HR contact
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {job.hr_email || "(not provided)"}
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">
                Coverage threshold
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {(job.coverage_threshold ?? 0.6) * 100}% minimum match required
              </p>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">
                Job ID
              </div>
              <p className="mt-1 text-sm text-slate-600">#{jobId}</p>
            </div>
          </div>
          {job.has_attachment && (
            <div>
              <div className="text-xs font-semibold uppercase text-slate-500">
                Job attachment
              </div>
              <button
                type="button"
                onClick={handleAttachmentDownload}
                disabled={downloadingAttachment}
                className="mt-1 inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {downloadingAttachment
                  ? "Downloading..."
                  : job.attachment_name
                  ? `Download ${job.attachment_name}`
                  : "Download attachment"}
              </button>
            </div>
          )}
          <div>
            <div className="text-xs font-semibold uppercase text-slate-500">
              Job description
            </div>
            <p className="p-3 mt-2 text-sm whitespace-pre-wrap border rounded-lg border-slate-100 bg-slate-50 text-slate-700">
              {job.jd_text || "(no description provided)"}
            </p>
          </div>
        </div>
      )}
      {error && (
        <div className="px-4 py-2 text-sm border rounded border-rose-200 bg-rose-50 text-rose-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="px-4 py-2 text-sm border rounded border-emerald-200 bg-emerald-50 text-emerald-700">
          {notice}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-4 p-4 bg-white border shadow-sm rounded-xl border-slate-200">
        <div className="flex-1 min-w-[220px]">
          <label
            className="block mb-1 text-sm font-medium text-slate-600"
            htmlFor="search"
          >
            Search (name / email / missing skills)
          </label>
          <input
            id="search"
            className="w-full px-3 py-2 text-sm border rounded-lg border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Type to filter..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div>
          <label
            className="block mb-1 text-sm font-medium text-slate-600"
            htmlFor="min-coverage"
          >
            Minimum coverage
          </label>
          <input
            id="min-coverage"
            type="number"
            step={0.05}
            min={0}
            max={1}
            className="px-3 py-2 text-sm border rounded-lg w-28 border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            value={minCoverage === "" ? "" : String(minCoverage)}
            onChange={(e) => {
              const value = e.target.value;
              setMinCoverage(value === "" ? "" : Number(value));
            }}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-200"
            checked={onlyPassed}
            onChange={(e) => setOnlyPassed(e.target.checked)}
          />
          Show only passed
        </label>
        <div>
          <label
            className="block mb-1 text-sm font-medium text-slate-600"
            htmlFor="sort-by"
          >
            Sort by
          </label>
          <select
            id="sort-by"
            className="px-3 py-2 text-sm border rounded-lg border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as "created_at" | "coverage")
            }
          >
            <option value="created_at">Created at</option>
            <option value="coverage">Coverage</option>
          </select>
        </div>
        <div>
          <label
            className="block mb-1 text-sm font-medium text-slate-600"
            htmlFor="sort-dir"
          >
            Direction
          </label>
          <select
            id="sort-dir"
            className="px-3 py-2 text-sm border rounded-lg border-slate-200 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            value={sortDir}
            onChange={(e) => setSortDir(e.target.value as "asc" | "desc")}
          >
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>
        <div className="text-sm text-slate-500">
          Showing {filteredRows.length} of {rows.length} applicants
        </div>
      </div>

      <div className="overflow-auto bg-white border shadow-sm rounded-xl border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="text-xs font-semibold tracking-wide text-left uppercase bg-slate-100 text-slate-600">
            <tr>
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Coverage</th>
              <th className="px-4 py-2">Similarity</th>
              <th className="px-4 py-2">Passed</th>
              <th className="px-4 py-2">Missing skills</th>
              <th className="px-4 py-2">Created at</th>
              <th className="px-4 py-2">CV details</th>
              <th className="px-4 py-2">Invite</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row: any) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{row.id}</td>
                <td className="px-4 py-2">{row.name}</td>
                <td className="px-4 py-2 text-slate-600">{row.email}</td>
                <td className="px-4 py-2">
                  {typeof row.coverage === "number"
                    ? row.coverage.toFixed(2)
                    : row.coverage}
                </td>
                <td className="px-4 py-2">
                  {typeof row.similarity === "number"
                    ? row.similarity.toFixed(2)
                    : row.similarity}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      row.passed
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {row.passed ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-4 py-2">{row.missing}</td>
                <td className="px-4 py-2 text-slate-500">
                  {formatTime(row.created_at)}
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                    onClick={() =>
                      setCvDetail({
                        ...row,
                        uploaded_file_path:
                          (row.uploaded_file_path || "").trim() || "",
                      })
                    }
                  >
                    View
                  </button>
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-col gap-1">
                    {row.invite_sent_at ? (
                      <span className="text-xs font-medium text-emerald-600">
                        Sent {formatTime(row.invite_sent_at)}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">
                        No invite sent
                      </span>
                    )}
                    {!row.invite_sent_at && (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                        onClick={() => openInviteModal(row)}
                        disabled={!row.email}
                      >
                        Send invite
                      </button>
                    )}
                    {!row.email && (
                      <span className="text-[11px] text-rose-500">
                        Email missing
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredRows.length === 0 && (
              <tr>
                <td
                  className="px-4 py-6 text-center text-slate-500"
                  colSpan={10}
                >
                  No applicants match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {inviteCandidate && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center px-4 bg-slate-900/50 backdrop-blur-sm"
          style={{ marginTop: 0 }}
        >
          <div className="w-full max-w-xl p-6 bg-white shadow-xl rounded-2xl">
            <h3 className="text-lg font-semibold text-slate-900">
              Send interview invitation
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              To:{" "}
              <span className="font-medium text-slate-800">
                {inviteCandidate.name || inviteCandidate.email}
              </span>{" "}
              ({inviteCandidate.email})
            </p>
            {inviteCandidate.invite_sent_at && (
              <p className="mt-1 text-xs text-emerald-600">
                Invitation already sent at{" "}
                {formatTime(inviteCandidate.invite_sent_at)}
              </p>
            )}
            <div className="mt-4 space-y-3">
              <div>
                <label
                  htmlFor="invite-subject"
                  className="block text-sm font-medium text-slate-700"
                >
                  Subject
                </label>
                <input
                  id="invite-subject"
                  className="w-full px-3 py-2 mt-1 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={inviteSubject}
                  onChange={(e) => setInviteSubject(e.target.value)}
                  placeholder="Interview invitation - Position"
                />
              </div>
              <div>
                <label
                  htmlFor="invite-body"
                  className="block text-sm font-medium text-slate-700"
                >
                  Message
                </label>
                <textarea
                  id="invite-body"
                  rows={8}
                  className="w-full px-3 py-2 mt-1 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={inviteBody}
                  onChange={(e) => setInviteBody(e.target.value)}
                  placeholder="Write the invitation message to the candidate..."
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-200"
                  checked={attachJobDescription}
                  onChange={(e) => setAttachJobDescription(e.target.checked)}
                  disabled={!job?.has_attachment}
                />
                Include JD attachment
                {!job?.has_attachment && (
                  <span className="text-xs text-slate-400">
                    (No attachment available)
                  </span>
                )}
              </label>
              {inviteError && (
                <div className="px-3 py-2 text-sm border rounded-lg text-rose-600 bg-rose-50 border-rose-100">
                  {inviteError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium transition border rounded-lg border-slate-300 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={closeInviteModal}
                disabled={sendingInvite}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold text-white transition bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleSendInvite}
                disabled={sendingInvite}
              >
                {sendingInvite ? "Sending..." : "Send invite"}
              </button>
            </div>
          </div>
        </div>
      )}
      {cvDetail && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center px-4 bg-slate-900/50 backdrop-blur-sm"
          style={{ marginTop: 0 }}
        >
          <div className="w-full max-w-xl p-6 bg-white shadow-xl rounded-2xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-900">
              Applicant CV
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Submitted at {formatTime(cvDetail.created_at)}
            </p>
            <div className="mt-4 space-y-4 text-sm text-slate-700">
              <div>
                <span className="font-semibold text-slate-800">CV text</span>
                <div className="p-3 mt-1 text-xs whitespace-pre-wrap border rounded-lg border-slate-200 bg-slate-50 text-slate-700">
                  {cvDetail.cv_text ||
                    "(No CV text captured. This applicant may have uploaded a file only.)"}
                </div>
              </div>
              <div>
                <span className="font-semibold text-slate-800">
                  Uploaded file
                </span>
                <div className="mt-1">
                  {cvDetail.uploaded_file_path ? (
                    <button
                      type="button"
                      className="inline-flex items-center rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => handleDownloadApplicantCv(cvDetail)}
                      disabled={downloadingCvId === cvDetail.id}
                    >
                      {downloadingCvId === cvDetail.id
                        ? "Preparing..."
                        : `Download ${cvDetail.uploaded_filename || "CV file"}`}
                    </button>
                  ) : (
                    <div className="p-3 mt-1 text-xs whitespace-pre-wrap border rounded-lg text-slate-500 border-slate-200 bg-slate-50">
                      (No CV uploaded)
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium transition border rounded-lg border-slate-300 text-slate-600 hover:bg-slate-100"
                onClick={() => setCvDetail(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApplicantsPage;
