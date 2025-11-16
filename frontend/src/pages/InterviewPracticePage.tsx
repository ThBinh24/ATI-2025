import React, { useEffect, useRef, useState } from "react";
import {
  sendInterviewMessage,
  startInterviewSession,
  listMyApplications,
} from "../services/backend";
import { useAuth } from "../context/AuthContext";
import RichTextEditor from "../components/text-editor";
import { htmlToPlainText, sanitizeHtml } from "../lib/sanitize";

type ChatMessage =
  | { type: "question"; text: string }
  | { type: "answer"; text: string }
  | {
      type: "feedback";
      rating: string;
      comment: string;
      tips: string[];
    };

const DOMAINS = [
  { key: "behavioral", label: "Behavioral" },
  { key: "technical", label: "Technical" },
];

const InterviewPracticePage: React.FC = () => {
  const { user } = useAuth();
  const [domain, setDomain] = useState("behavioral");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [jdContent, setJdContent] = useState("");
  const [jdFile, setJdFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [appliedJobs, setAppliedJobs] = useState<any[]>([]);
  const [loadingAppliedJobs, setLoadingAppliedJobs] = useState(false);
  const [selectedAppliedJob, setSelectedAppliedJob] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (user?.role !== "student") return;
    setLoadingAppliedJobs(true);
    listMyApplications()
      .then((res) => setAppliedJobs(res.data || []))
      .catch(() => setAppliedJobs([]))
      .finally(() => setLoadingAppliedJobs(false));
  }, [user?.role]);

  const handleJdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setJdFile(file ?? null);
  };

  const clearJdFile = () => {
    setJdFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const startSession = async () => {
    const plainJd = htmlToPlainText(jdContent);
    if (!plainJd.trim() && !jdFile && !selectedAppliedJob) {
      setError(
        "Paste the job description, upload a JD, or select one of your applied jobs."
      );
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await startInterviewSession({
        domain,
        jd_text: plainJd,
        jd_file: jdFile ?? undefined,
        job_id: selectedAppliedJob ? Number(selectedAppliedJob) : undefined,
      });
      const data = res.data;
      setSessionId(data.session_id);
      setCurrentQuestion(data.question);
      setCompleted(false);
      setMessages([
        { type: "question", text: data.question },
        {
          type: "feedback",
          rating: "Tip",
          comment:
            "Answer with the STAR framework (Situation, Task, Action, Result) to structure your response.",
          tips: [
            "Reference responsibilities mentioned in the JD.",
            "Explain the action you took.",
            "Highlight results or what you learned.",
          ],
        },
      ]);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "Unable to start interview session right now."
      );
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (!sessionId || !currentQuestion) {
      setError("Start a session before submitting an answer.");
      return;
    }
    if (!answer.trim()) {
      setError("Please enter your answer before sending.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await sendInterviewMessage(sessionId, { answer });
      const data = res.data;
      const nextMessages: ChatMessage[] = [
        { type: "answer", text: answer.trim() },
        {
          type: "feedback",
          rating: data.feedback.rating,
          comment: data.feedback.comment,
          tips: data.feedback.tips,
        },
      ];
      if (data.next_question) {
        nextMessages.push({ type: "question", text: data.next_question });
        setCurrentQuestion(data.next_question);
        setCompleted(false);
      } else {
        setCurrentQuestion(null);
        setCompleted(true);
      }
      setMessages((prev) => [...prev, ...nextMessages]);
      setAnswer("");
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "Failed to send your answer. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl p-6 mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Interview practice
          </h1>
          <p className="text-sm text-slate-600">
            Paste the job description or upload the JD to generate tailored
            interview questions.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {DOMAINS.map((d) => (
            <button
              key={d.key}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                domain === d.key
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              onClick={() => {
                setDomain(d.key);
                setSessionId(null);
                setMessages([]);
                setCurrentQuestion(null);
                setCompleted(false);
              }}
              disabled={loading}
            >
              {d.label}
            </button>
          ))}
          <button
            className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white transition rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
            onClick={startSession}
            disabled={loading}
          >
            {sessionId ? "Restart Session" : "Start Session"}
          </button>
        </div>
      </div>

      <section className="p-6 space-y-3 bg-white border shadow-sm rounded-xl border-slate-200">
        <label
          htmlFor="jd-text"
          className="block text-sm font-medium text-slate-700"
        >
          Job description
        </label>
        <RichTextEditor
          content={jdContent}
          onChange={setJdContent}
          placeholder="Paste the job description here (responsibilities, required skills, etc.)."
        />
        <p className="text-xs text-slate-500">
          Paste the job description or upload a PDF/DOCX file. We&rsquo;ll use
          it to tailor five interview questions around the key responsibilities
          and skills.
        </p>
        {user?.role === "student" && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">
              Or select a job you already applied to
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <select
                className="w-full max-w-md px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                value={selectedAppliedJob}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedAppliedJob(value);
                  if (!value) {
                    return;
                  }
                  const job = appliedJobs.find(
                    (item) => String(item.id) === value
                  );
                  const jdString = sanitizeHtml(
                    job?.job_jd_text || job?.jd_text || ""
                  );
                  const htmlValue = jdString
                    ? jdString
                        .split("\n")
                        .filter((line) => line.trim().length > 0)
                        .map((line) => `<p>${line}</p>`)
                        .join("")
                    : "";
                  setJdContent(htmlValue);
                }}
                disabled={loadingAppliedJobs}
              >
                <option value="">
                  {loadingAppliedJobs
                    ? "Loading applied jobs..."
                    : "Select a job"}
                </option>
                {appliedJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.job_title_full || job.job_title || `Job #${job.id}`}
                  </option>
                ))}
              </select>
              {selectedAppliedJob && (
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <button
                    type="button"
                    className="font-medium text-slate-600 hover:text-slate-800"
                    onClick={() => {
                      setSelectedAppliedJob("");
                      setJdContent("");
                    }}
                    disabled={loading}
                  >
                    Clear selection
                  </button>
                  {selectedAppliedJob && !htmlToPlainText(jdContent).trim() && (
                    <span className="text-amber-600">
                      JD text missing for this job, but we'll fetch it automatically.
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="jd-file"
              className="text-sm font-medium text-slate-700"
            >
              Upload JD file (optional)
            </label>
            <input
              id="jd-file"
              type="file"
              accept=".pdf,.docx,.txt,.md,.rtf"
              onChange={handleJdFileChange}
              ref={fileInputRef}
              disabled={loading}
              className="text-sm"
            />
            <p className="text-xs text-slate-500">
              Accepted formats: PDF, DOCX, TXT. The file content will be
              converted to text for analysis.
            </p>
          </div>
          {jdFile ? (
            <div className="px-3 py-2 text-xs text-blue-800 border border-blue-100 rounded-md bg-blue-50">
              <div className="font-medium">Selected file</div>
              <div className="truncate">{jdFile.name}</div>
              <button
                type="button"
                className="mt-1 text-blue-600 hover:underline"
                onClick={clearJdFile}
                disabled={loading}
              >
                Remove file
              </button>
            </div>
          ) : (
            <div className="text-xs text-slate-500">No file uploaded.</div>
          )}
        </div>
      </section>

      {error && (
        <div className="px-4 py-2 text-sm border rounded border-rose-200 bg-rose-50 text-rose-600">
          {error}
        </div>
      )}

      <section className="p-6 space-y-4 bg-white border shadow-sm rounded-xl border-slate-200">
        <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
          {messages.length === 0 ? (
            <div className="text-sm text-slate-500">
              Start a session to receive interview questions and feedback.
            </div>
          ) : (
            messages.map((msg, idx) => {
              if (msg.type === "question") {
                return (
                  <div
                    key={`question-${idx}`}
                    className="px-4 py-3 text-sm text-blue-800 border border-blue-100 rounded-lg bg-blue-50"
                  >
                    <div className="text-xs font-semibold text-blue-600 uppercase">
                      Question
                    </div>
                    {msg.text}
                  </div>
                );
              }
              if (msg.type === "answer") {
                return (
                  <div
                    key={`answer-${idx}`}
                    className="px-4 py-3 text-sm rounded-lg bg-slate-100 text-slate-700"
                  >
                    <div className="text-xs font-semibold uppercase text-slate-500">
                      Your answer
                    </div>
                    {msg.text}
                  </div>
                );
              }
              return (
                <div
                  key={`feedback-${idx}`}
                  className="px-4 py-3 text-sm border rounded-lg border-emerald-200 bg-emerald-50 text-emerald-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-emerald-600">
                      Feedback ({msg.rating})
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-emerald-900">{msg.comment}</p>
                  {msg.tips.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs list-disc list-inside text-emerald-700">
                      {msg.tips.map((tip, tipIdx) => (
                        <li key={`tip-${idx}-${tipIdx}`}>{tip}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-700"
            htmlFor="answer"
          >
            Your response
          </label>
          <textarea
            id="answer"
            className="w-full h-32 px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder={
              currentQuestion
                ? "Write your answer here..."
                : "Start a session to receive questions."
            }
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            disabled={!currentQuestion || loading}
          />
          <div className="flex items-center justify-between">
            <div className="text-xs text-slate-500">
              {completed
                ? "Session completed. Restart for more practice."
                : currentQuestion
                ? "Tip: Structure your answer using STAR (Situation, Task, Action, Result)."
                : "No active question."}
            </div>
            <button
              className="inline-flex items-center px-4 py-2 text-sm font-semibold text-white transition bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
              onClick={submitAnswer}
              disabled={!currentQuestion || loading}
            >
              {loading ? "Processing..." : "Send answer"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default InterviewPracticePage;
