import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ProfileInfo,
  StoredCvEntry,
  addUploadedCv,
  getProfileInfo,
  listProfileCvs,
  removeCvEntry,
  saveProfileInfo,
  subscribeCvChanges,
} from "../lib/profileStore";
import { exportProfilePdf } from "../services/backend";
import { useAuth } from "../context/AuthContext";

const emptyInfo: ProfileInfo = {
  name: "",
  phone: "",
  email: "",
  avatarDataUrl: "",
};

const MyProfilePage: React.FC = () => {
  const { user } = useAuth();
  const hasCvTab = user?.role === "student";
  const [activeTab, setActiveTab] = useState<"info" | "cvs">(
    hasCvTab ? "info" : "info"
  );
  const [profile, setProfile] = useState<ProfileInfo>(() => ({
    ...emptyInfo,
    email: user?.email,
    ...getProfileInfo(),
  }));
  const [cvEntries, setCvEntries] = useState<StoredCvEntry[]>(() => listProfileCvs());
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const initials = useMemo(() => {
    const name = profile.name || user?.name || "User";
    return name
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }, [profile.name, user?.name]);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState<string | undefined>(profile.avatarDataUrl);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsub = subscribeCvChanges(() => setCvEntries(listProfileCvs()));
    return unsub;
  }, []);

  useEffect(() => {
    setProfile((prev) => {
      if (prev.email || !user?.email) return prev;
      return { ...prev, email: user.email };
    });
  }, [user?.email]);

  const handleAvatarDraftChange = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setAvatarDraft(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleInfoSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveProfileInfo(profile);
    setStatusMessage("Profile information saved.");
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleUploadCv = async (file: File | null) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Please choose a file smaller than 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        addUploadedCv({
          name: file.name,
          mime: file.type || "application/octet-stream",
          dataUrl: reader.result,
        });
        setUploadError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDownloadBuilderCv = async (entry: StoredCvEntry & { type: "builder" }) => {
    try {
      const res = await exportProfilePdf(entry.draftId);
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${entry.name || "profile"}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setUploadError("Failed to download CV. Please try again.");
    }
  };

  const renderCvEntry = (entry: StoredCvEntry) => {
    if (entry.type === "uploaded") {
      return (
        <div
          key={entry.id}
          className="flex items-center justify-between p-3 border rounded-lg border-slate-200 bg-slate-50"
        >
          <div>
            <p className="text-sm font-semibold text-slate-800">{entry.name}</p>
            <p className="text-xs text-slate-500">
              Uploaded on {new Date(entry.uploadedAt).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              onClick={() => {
                const link = document.createElement("a");
                link.href = entry.dataUrl;
                link.download = entry.name;
                link.click();
              }}
            >
              Download
            </button>
            <button
              type="button"
              onClick={() => removeCvEntry(entry.id)}
              className="px-3 py-1 text-xs font-semibold text-white rounded-lg bg-rose-500 hover:bg-rose-600"
            >
              Remove
            </button>
          </div>
        </div>
      );
    }
    return (
      <div
        key={entry.id}
        className="flex items-center justify-between p-3 bg-white border rounded-lg border-slate-200"
      >
        <div>
          <p className="text-sm font-semibold text-slate-800">{entry.name || "AI Draft"}</p>
          <p className="text-xs text-slate-500">
            Draft #{entry.draftId} • {entry.templateId || "Template"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleDownloadBuilderCv(entry)}
            className="px-3 py-1 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Download
          </button>
          <button
            type="button"
            onClick={() => removeCvEntry(entry.id)}
            className="px-3 py-1 text-xs font-semibold text-white rounded-lg bg-rose-500 hover:bg-rose-600"
          >
            Remove
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">My Profile</h1>
        <p className="text-sm text-slate-500">
          Manage your personal details and keep track of CVs generated or uploaded to the platform.
        </p>
      </header>

      <div className="bg-white border rounded-2xl border-slate-200">
        <div className="flex items-center border-b border-slate-200">
          <button
            onClick={() => setActiveTab("info")}
            className={`flex-1 px-4 py-3 text-sm font-semibold ${
              activeTab === "info" ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-500"
            }`}
          >
            Personal Info
          </button>
          {hasCvTab && (
            <button
              onClick={() => setActiveTab("cvs")}
              className={`flex-1 px-4 py-3 text-sm font-semibold ${
                activeTab === "cvs" ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-500"
              }`}
            >
              My CVs
            </button>
          )}
        </div>

        {activeTab === "info" && (
          <form onSubmit={handleInfoSave} className="p-6 space-y-5">
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_400px] md:items-center">
              <div className="max-w-full space-y-4">
                <div className="max-w-full space-y-2">
                  <label className="text-sm font-medium text-slate-700">Full name</label>
                  <input
                    className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    value={profile.name || ""}
                    onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="max-w-full space-y-2">
                  <label className="text-sm font-medium text-slate-700">Phone</label>
                  <input
                    className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    value={profile.phone || ""}
                    onChange={(e) => setProfile((prev) => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div className="max-w-full space-y-2">
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <input
                    className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    value={profile.email || ""}
                    onChange={(e) => setProfile((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center md:justify-self-center">
                <button
                  type="button"
                  onClick={() => {
                    setAvatarDraft(profile.avatarDataUrl);
                    setAvatarModalOpen(true);
                  }}
                  className="flex items-center justify-center overflow-hidden text-lg font-semibold border rounded-full shadow w-28 h-28 bg-slate-200 text-slate-700 border-slate-200"
                >
                  {profile.avatarDataUrl ? (
                    <img src={profile.avatarDataUrl} alt="avatar" className="object-cover w-full h-full" />
                  ) : (
                    initials
                  )}
                </button>
                <p className="text-xs text-slate-500">Click to change photo</p>
              </div>
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-semibold text-white transition bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Save changes
            </button>
            {statusMessage && <p className="text-sm text-emerald-600">{statusMessage}</p>}
          </form>
        )}

        {hasCvTab && activeTab === "cvs" && (
          <div className="p-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Upload a CV file</label> <br />
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={(e) => handleUploadCv(e.target.files?.[0] ?? null)}
              />
              {uploadError && <p className="text-xs text-rose-600">{uploadError}</p>}
            </div>
            <div className="space-y-3">
              {cvEntries.length === 0 ? (
                <p className="text-sm text-slate-500">No CVs saved yet. Add one from here or from the AI Profile Builder.</p>
              ) : (
                cvEntries.map(renderCvEntry)
              )}
            </div>
          </div>
        )}
      </div>

      {avatarModalOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center px-4 bg-black/40" style={{marginTop: 0}}>
          <div className="w-full max-w-3xl p-6 space-y-5 bg-white shadow-xl rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Update photo</h3>
                <p className="text-sm text-slate-500">Upload or adjust the avatar used across your CVs.</p>
              </div>
              <button
                type="button"
                className="text-sm text-slate-500 hover:text-slate-700"
                onClick={() => {
                  setAvatarDraft(profile.avatarDataUrl);
                  setAvatarModalOpen(false);
                }}
              >
                Close
              </button>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-700">Source image</p>
                <div
                  onClick={() => avatarInputRef.current?.click()}
                  className="flex items-center justify-center w-full border-2 border-dashed cursor-pointer h-52 rounded-2xl border-slate-300 text-slate-500 hover:border-blue-400"
                >
                  {avatarDraft ? (
                    <img src={avatarDraft} alt="avatar draft" className="object-cover w-full h-full rounded-2xl" />
                  ) : (
                    <span>Click to upload (max 5MB)</span>
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleAvatarDraftChange(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-slate-400">PNG, JPG, or SVG. Square images look best.</p>
              </div>
              <div className="flex flex-col items-center gap-4">
                <p className="text-sm font-medium text-slate-700">Preview</p>
                <div className="flex items-center justify-center w-32 h-32 overflow-hidden text-xl font-semibold border rounded-full border-slate-200 bg-slate-100 text-slate-600">
                  {avatarDraft ? (
                    <img src={avatarDraft} alt="preview" className="object-cover w-full h-full" />
                  ) : (
                    initials
                  )}
                </div>
                <div className="flex flex-col w-full gap-2 text-sm">
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    Choose image
                  </button>
                  <button
                    type="button"
                    className="w-full px-3 py-2 border rounded-lg text-rose-600 border-rose-200 hover:bg-rose-50"
                    onClick={() => setAvatarDraft(undefined)}
                  >
                    Remove photo
                  </button>
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      className="flex-1 px-3 py-2 text-white rounded-lg bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => {
                        setProfile((prev) => ({ ...prev, avatarDataUrl: avatarDraft || "" }));
                        setAvatarModalOpen(false);
                      }}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="flex-1 px-3 py-2 border rounded-lg text-slate-600 border-slate-200 hover:bg-slate-100"
                      onClick={() => {
                        setAvatarDraft(profile.avatarDataUrl);
                        setAvatarModalOpen(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyProfilePage;
