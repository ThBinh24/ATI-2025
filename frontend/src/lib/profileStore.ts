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
      backendId?: number;
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

const keyForUser = (base: string, userId?: number | null) => {
  const suffix = userId != null ? String(userId) : "anon";
  return `${base}:${suffix}`;
};

const readWithLegacyFallback = <T>(base: string, userId?: number | null) => {
  const namespaced = safeJsonParse<T>(localStorage.getItem(keyForUser(base, userId)));
  if (namespaced) {
    return namespaced;
  }
  return safeJsonParse<T>(localStorage.getItem(base));
};

export const getProfileInfo = (userId?: number | null): ProfileInfo =>
  readWithLegacyFallback<ProfileInfo>(PROFILE_INFO_KEY, userId) || {};

export const saveProfileInfo = (info: ProfileInfo, userId?: number | null) => {
  localStorage.setItem(keyForUser(PROFILE_INFO_KEY, userId), JSON.stringify(info));
  if (userId != null) {
    localStorage.removeItem(PROFILE_INFO_KEY);
  }
  window.dispatchEvent(new Event(PROFILE_INFO_EVENT));
};

export const listProfileCvs = (userId?: number | null): StoredCvEntry[] =>
  readWithLegacyFallback<StoredCvEntry[]>(PROFILE_CV_KEY, userId) || [];

const persistCvList = (entries: StoredCvEntry[], userId?: number | null) => {
  localStorage.setItem(keyForUser(PROFILE_CV_KEY, userId), JSON.stringify(entries));
  if (userId != null) {
    localStorage.removeItem(PROFILE_CV_KEY);
  }
  window.dispatchEvent(new Event(PROFILE_EVENT));
};

export const addUploadedCv = (params: {
  name: string;
  mime: string;
  dataUrl: string;
}, userId?: number | null) => {
  const next: StoredCvEntry = {
    id: crypto.randomUUID(),
    type: "uploaded",
    name: params.name,
    mime: params.mime,
    dataUrl: params.dataUrl,
    uploadedAt: new Date().toISOString(),
  };
  const entries = listProfileCvs(userId);
  entries.unshift(next);
  persistCvList(entries, userId);
  return next;
};

export const addBuilderCv = (params: {
  draftId: number;
  name: string;
  templateId?: string;
}, userId?: number | null) => {
  const next: StoredCvEntry = {
    id: `builder-${params.draftId}-${Date.now()}`,
    type: "builder",
    name: params.name || "Untitled",
    templateId: params.templateId,
    draftId: params.draftId,
    addedAt: new Date().toISOString(),
  };
  const entries = listProfileCvs(userId);
  if (!entries.find((entry) => entry.type === "builder" && entry.draftId === params.draftId)) {
    entries.unshift(next);
    persistCvList(entries, userId);
  }
  return next;
};

export const removeCvEntry = (id: string, userId?: number | null) => {
  const filtered = listProfileCvs(userId).filter((entry) => entry.id !== id);
  persistCvList(filtered, userId);
};

export const setUploadedBackendId = (
  entryId: string,
  backendId: number | null,
  userId?: number | null
) => {
  const entries = listProfileCvs(userId);
  let changed = false;
  const updated = entries.map((entry) => {
    if (entry.id === entryId && entry.type === "uploaded") {
      changed = true;
      return {
        ...entry,
        backendId: backendId ?? undefined,
      };
    }
    return entry;
  });
  if (changed) {
    persistCvList(updated, userId);
  }
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
