export type ProfileInfo = {
  avatarDataUrl?: string;
  name?: string;
  phone?: string;
  email?: string;
};

export type StoredCvEntry =
  | {
      id: string;
      type: "uploaded";
      name: string;
      mime: string;
      dataUrl: string;
      uploadedAt: string;
    }
  | {
      id: string;
      type: "builder";
      name: string;
      templateId?: string;
      draftId: number;
      addedAt: string;
    };

const PROFILE_INFO_KEY = "cv_matcher_profile_info";
const PROFILE_CV_KEY = "cv_matcher_profile_cvs";
const PROFILE_EVENT = "profile-cv-updated";
const PROFILE_INFO_EVENT = "profile-info-updated";

const safeJsonParse = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const getProfileInfo = (): ProfileInfo =>
  safeJsonParse<ProfileInfo>(localStorage.getItem(PROFILE_INFO_KEY)) || {};

export const saveProfileInfo = (info: ProfileInfo) => {
  localStorage.setItem(PROFILE_INFO_KEY, JSON.stringify(info));
  window.dispatchEvent(new Event(PROFILE_INFO_EVENT));
};

export const listProfileCvs = (): StoredCvEntry[] =>
  safeJsonParse<StoredCvEntry[]>(localStorage.getItem(PROFILE_CV_KEY)) || [];

const persistCvList = (entries: StoredCvEntry[]) => {
  localStorage.setItem(PROFILE_CV_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(PROFILE_EVENT));
};

export const addUploadedCv = (params: {
  name: string;
  mime: string;
  dataUrl: string;
}) => {
  const next: StoredCvEntry = {
    id: crypto.randomUUID(),
    type: "uploaded",
    name: params.name,
    mime: params.mime,
    dataUrl: params.dataUrl,
    uploadedAt: new Date().toISOString(),
  };
  const entries = listProfileCvs();
  entries.unshift(next);
  persistCvList(entries);
  return next;
};

export const addBuilderCv = (params: {
  draftId: number;
  name: string;
  templateId?: string;
}) => {
  const next: StoredCvEntry = {
    id: `builder-${params.draftId}-${Date.now()}`,
    type: "builder",
    name: params.name || "Untitled",
    templateId: params.templateId,
    draftId: params.draftId,
    addedAt: new Date().toISOString(),
  };
  const entries = listProfileCvs();
  if (!entries.find((entry) => entry.type === "builder" && entry.draftId === params.draftId)) {
    entries.unshift(next);
    persistCvList(entries);
  }
  return next;
};

export const removeCvEntry = (id: string) => {
  const filtered = listProfileCvs().filter((entry) => entry.id !== id);
  persistCvList(filtered);
};

export const subscribeCvChanges = (callback: () => void) => {
  const handler = () => callback();
  window.addEventListener(PROFILE_EVENT, handler);
  return () => window.removeEventListener(PROFILE_EVENT, handler);
};

export const subscribeProfileInfo = (callback: () => void) => {
  const handler = () => callback();
  window.addEventListener(PROFILE_INFO_EVENT, handler);
  return () => window.removeEventListener(PROFILE_INFO_EVENT, handler);
};
