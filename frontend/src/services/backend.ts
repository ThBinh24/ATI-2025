import api from "../lib/api";

export const health = () => api.get("/health");

export const listJobs = () => api.get("/jobs");
export const getJob = (id: number) => api.get(`/jobs/${id}`);

export interface CreateJobPayload {
  title: string;
  company_name: string;
  jd_text: string;
  hr_email: string;
  coverage_threshold?: number;
  attachment?: File | null;
}

export const createJob = (payload: CreateJobPayload) => {
  const form = new FormData();
  form.append("title", payload.title);
  form.append("company_name", payload.company_name ?? "");
  form.append("jd_text", payload.jd_text ?? "");
  form.append("hr_email", payload.hr_email ?? "");
  form.append(
    "coverage_threshold",
    String(payload.coverage_threshold ?? 0.6),
  );
  if (payload.attachment) {
    form.append("jd_file", payload.attachment);
  }
  return api.post("/jobs", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export interface UpdateJobPayload extends CreateJobPayload {
  remove_attachment?: boolean;
}

export const updateJob = (jobId: number, payload: UpdateJobPayload) => {
  const form = new FormData();
  form.append("title", payload.title);
  form.append("company_name", payload.company_name ?? "");
  form.append("jd_text", payload.jd_text ?? "");
  form.append("hr_email", payload.hr_email ?? "");
  form.append(
    "coverage_threshold",
    String(payload.coverage_threshold ?? 0.6),
  );
  form.append(
    "remove_attachment",
    String(Boolean(payload.remove_attachment)),
  );
  if (payload.attachment instanceof File) {
    form.append("jd_file", payload.attachment);
  }
  return api.put(`/jobs/${jobId}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const deleteJob = (jobId: number) => api.delete(`/jobs/${jobId}`);

export const listPendingJobs = () => api.get("/jobs/pending");
export const updateJobStatus = (
  jobId: number,
  payload: { status: "approved" | "rejected"; rejection_reason?: string }
) => api.patch(`/jobs/${jobId}/status`, payload);
export const listJobHistory = () => api.get("/jobs/history");

export const processCV = (payload: { cv_text: string; job_id?: number }) =>
  api.post("/cv/process", payload);

export const processCVFile = (file: File, job_id?: number) => {
  const form = new FormData();
  form.append("file", file);
  const params: any = {};
  if (typeof job_id === "number") params.job_id = job_id;
  return api.post("/cv/process-file", form, {
    params,
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const listApplicants = (job_id: number) =>
  api.get("/applicants", { params: { job_id } });

export const logApplicant = (payload: any) =>
  api.post("/applicants/log", payload);
export const listMyApplications = () => api.get("/applicants/my");
export const getMyApplicationDetail = (applicationId: number) =>
  api.get(`/applicants/my/${applicationId}`);
export const uploadCvFile = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/applicants/upload-cv", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
export const downloadMyApplicationCv = (applicationId: number) =>
  api.get(`/applicants/my/${applicationId}/cv`, { responseType: "blob" });
export const downloadApplicantCv = (applicantId: number) =>
  api.get(`/applicants/${applicantId}/cv`, { responseType: "blob" });
export const sendApplicantInvite = (
  applicantId: number,
  payload: { subject: string; body: string; attach_jd?: boolean },
) => api.post(`/applicants/${applicantId}/invite`, payload);

export interface JobDescriptionPayload {
  title: string;
  experience_level?: string;
  core_skills?: string[];
  responsibilities?: string;
  benefits?: string;
  company_name?: string;
  tone?: string;
}

export const generateJobDescription = (payload: JobDescriptionPayload) =>
  api.post("/jobs/generate-jd", payload);

export const generateJobInterviewQuestions = (
  jobId: number,
  payload: { domain: string; jd_text?: string; jd_file?: File | null },
) => {
  const form = new FormData();
  form.append("domain", payload.domain);
  if (payload.jd_text && payload.jd_text.trim()) {
    form.append("jd_text", payload.jd_text);
  }
  if (payload.jd_file instanceof File) {
    form.append("jd_file", payload.jd_file);
  }
  return api.post(`/jobs/${jobId}/interview-questions`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export interface InterviewStartPayload {
  domain: string;
  jd_text?: string;
  jd_file?: File | null;
  job_id?: number;
}

export const startInterviewSession = (payload: InterviewStartPayload) => {
  if (payload.jd_file instanceof File) {
    const form = new FormData();
    form.append("domain", payload.domain);
    form.append("jd_file", payload.jd_file);
    if (payload.jd_text?.trim()) {
      form.append("jd_text", payload.jd_text);
    }
    if (typeof payload.job_id === "number") {
      form.append("job_id", String(payload.job_id));
    }
    return api.post("/interview/session", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  }
  return api.post("/interview/session", {
    domain: payload.domain,
    jd_text: payload.jd_text,
    job_id: payload.job_id,
  });
};
export const sendInterviewMessage = (
  sessionId: string,
  payload: { answer: string },
) => api.post(`/interview/session/${sessionId}/message`, payload);

export const sendEmail = (payload: {
  to_email: string;
  subject: string;
  body: string;
  attachment_name?: string;
  attachment_b64?: string;
}) => api.post("/email/send", payload);

export const listUsers = () => api.get("/auth/users");
export const banUser = (userId: number, reason: string) =>
  api.post(`/auth/users/${userId}/ban`, { reason });
export const unbanUser = (userId: number) =>
  api.post(`/auth/users/${userId}/unban`);
export const listBannedUsers = () => api.get("/auth/users/banned");
export const downloadJobAttachment = (jobId: number) =>
  api.get(`/jobs/${jobId}/attachment`, { responseType: "blob" });

export interface ProfileTemplateContractField {
  id: string;
  label: string;
  type: "text" | "textarea" | string;
  maxLength?: number;
}

export interface ProfileTemplateBlock {
  id: string;
  label: string;
  type: string;
  placement?: "full" | "main" | "side";
  required?: boolean;
  optional?: boolean;
  removable?: boolean;
  min?: number;
  max?: number;
  item_label?: string;
  fields?: ProfileTemplateContractField[];
}

export interface ProfileTemplateContract {
  schema_version?: string;
  default_order?: string[];
  blocks?: ProfileTemplateBlock[];
}

export interface ProfileTemplate {
  id: string;
  name: string;
  version: string;
  style: string;
  description?: string;
  contract?: ProfileTemplateContract;
}

export interface ProfileGeneratePayload {
  field: string;
  position: string;
  style: string;
  language?: string;
  template_id?: string;
  notes?: string;
}

export interface ProfileDraft {
  id: number;
  template_id: string;
  template_version: string;
  schema_version: string;
  data: Record<string, any>;
  blocks: ProfileBlockState[];
  created_at?: string;
  updated_at?: string;
}

export interface ProfileDraftSummary {
  id: number;
  template_id: string;
  template_version: string;
  name?: string;
  headline?: string;
  updated_at?: string;
  created_at?: string;
}

export interface ProfileBlockState {
  id: string;
  label: string;
  type: string;
  placement?: string;
  enabled: boolean;
  order?: number;
  config?: ProfileTemplateBlock;
}

export const listProfileTemplates = () =>
  api.get<ProfileTemplate[]>("/profiles/templates");

export const generateProfileDraft = (payload: ProfileGeneratePayload) =>
  api.post<ProfileDraft>("/profiles/generate", payload);

export const getProfileDraft = (draftId: number) =>
  api.get<ProfileDraft>(`/profiles/${draftId}`);

export const updateProfileDraft = (
  draftId: number,
  payload: {
    template_id?: string;
    data: Record<string, any>;
    blocks?: ProfileBlockState[];
  },
) => api.put<ProfileDraft>(`/profiles/${draftId}`, payload);

export const renderProfileDraft = (
  draftId: number,
  templateId?: string,
) =>
  api.post<{ html: string; css: string; template_version: string }>(
    `/profiles/${draftId}/render`,
    {},
    { params: templateId ? { template_id: templateId } : undefined },
  );

export const exportProfilePdf = (draftId: number, templateId?: string) =>
  api.get(`/profiles/${draftId}/export/pdf`, {
    params: templateId ? { template_id: templateId } : undefined,
    responseType: "blob",
  });

export const listProfileDraftsForUser = () =>
  api.get<ProfileDraftSummary[]>("/profiles/drafts");

export const deleteProfileDraft = (draftId: number) =>
  api.delete(`/profiles/${draftId}`);

export const activateProfileDraft = (draftId: number) =>
  api.post<ProfileDraftSummary>(`/profiles/drafts/${draftId}/activate`, {});

export const getActiveProfileDraft = () =>
  api.get<ProfileDraftSummary | null>("/profiles/drafts/active");

export const clearActiveProfileDraft = () =>
  api.post("/profiles/drafts/active/clear", {});

export interface JobMatchDetails {
  cv_skills: string[];
  jd_skills: string[];
  matched: string[];
  missing: string[];
  coverage: number;
  similarity: number;
  passed: boolean;
  predicted_role: string;
  quality_warnings: any[];
  course_suggestions: any[];
  score: number;
}

export interface JobWithMatch extends Record<string, any> {
  match: JobMatchDetails;
}

export const listJobsMatchedToProfile = (limit?: number) =>
  api.get<JobWithMatch[]>("/jobs/profile-match", {
    params: typeof limit === "number" ? { limit } : undefined,
  });

export interface JobMatchHistoryEntry {
  job: Record<string, any>;
  match: JobMatchDetails;
  matched_at: string;
}

export const listProfileMatchHistory = (limit?: number) =>
  api.get<JobMatchHistoryEntry[]>("/jobs/profile-match/history", {
    params: typeof limit === "number" ? { limit } : undefined,
  });

export const clearProfileMatchHistory = () =>
  api.delete("/jobs/profile-match/history");
