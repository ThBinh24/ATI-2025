import React, { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  generateProfileDraft,
  listProfileTemplates,
  ProfileDraft,
  ProfileGeneratePayload,
  ProfileTemplate,
  renderProfileDraft,
  updateProfileDraft,
} from "../services/backend";

type DraftData = Record<string, any>;

const emptyDraftData: DraftData = {
  name: "",
  headline: "",
  contact_block: "",
  summary: "",
  experiences: [],
  skills: [],
  projects: [],
  education: [],
};

const ProfileBuilderPage: React.FC = () => {
  const [templates, setTemplates] = useState<ProfileTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [form, setForm] = useState<ProfileGeneratePayload>({
    field: "",
    position: "",
    style: "modern",
    language: "English",
    notes: "",
  });
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [draftData, setDraftData] = useState<DraftData>(emptyDraftData);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [preview, setPreview] = useState<{ html: string; css: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listProfileTemplates()
      .then((res) => {
        setTemplates(res.data || []);
        if (res.data?.length && !selectedTemplate) {
          setSelectedTemplate(res.data[0].id);
        }
      })
      .catch(() => setError("Failed to load templates."));
  }, []);

  useEffect(() => {
    if (draft) {
      setDraftData(draft.data || emptyDraftData);
    }
  }, [draft]);

  useEffect(() => {
    if (draft) {
      refreshPreview(draft.id, selectedTemplate);
    }
  }, [draft?.id, selectedTemplate]);

  const templateOptions = useMemo(() => {
    return templates.map((tpl) => (
      <option key={tpl.id} value={tpl.id}>
        {tpl.name}
      </option>
    ));
  }, [templates]);

  const handleGenerate = async () => {
    if (!form.field.trim() || !form.position.trim()) {
      setError("Field and position are required.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const payload = { ...form, template_id: selectedTemplate };
      const res = await generateProfileDraft(payload);
      setDraft(res.data);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "Failed to generate profile. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const refreshPreview = async (draftId: number, templateId?: string) => {
    setRendering(true);
    try {
      const res = await renderProfileDraft(draftId, templateId);
      setPreview({ html: res.data.html, css: res.data.css });
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "Failed to render preview. Please try again.",
      );
    } finally {
      setRendering(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await updateProfileDraft(draft.id, {
        template_id: selectedTemplate,
        data: draftData,
      });
      setDraft(res.data);
      refreshPreview(res.data.id, selectedTemplate);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "Failed to save changes. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!previewRef.current) {
      setError("Nothing to download yet.");
      return;
    }
    const canvas = await html2canvas(previewRef.current, {
      scale: 2,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "pt", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
    const imgWidth = canvas.width * ratio;
    const imgHeight = canvas.height * ratio;
    pdf.addImage(
      imgData,
      "PNG",
      (pageWidth - imgWidth) / 2,
      20,
      imgWidth,
      imgHeight,
    );
    pdf.save(`${draftData.name || "profile"}.pdf`);
  };

  const updateField = (key: string, value: string) => {
    setDraftData((prev) => ({ ...prev, [key]: value }));
  };

  const updateExperience = (
    index: number,
    key: "title" | "company" | "period" | "achievements",
    value: string,
  ) => {
    setDraftData((prev) => {
      const next = { ...prev };
      const list = Array.isArray(next.experiences)
        ? [...next.experiences]
        : [];
      if (!list[index]) {
        list[index] = {
          title: "",
          company: "",
          period: "",
          achievements: [],
        };
      }
      if (key === "achievements") {
        list[index][key] = value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      } else {
        list[index][key] = value;
      }
      next.experiences = list;
      return next;
    });
  };

  const updateProject = (
    index: number,
    field: "name" | "description",
    value: string,
  ) => {
    setDraftData((prev) => {
      const next = { ...prev };
      const list = Array.isArray(next.projects) ? [...next.projects] : [];
      if (!list[index]) {
        list[index] = { name: "", description: "" };
      }
      list[index][field] = value;
      next.projects = list;
      return next;
    });
  };

  const updateEducation = (
    index: number,
    field: "school" | "degree" | "period",
    value: string,
  ) => {
    setDraftData((prev) => {
      const next = { ...prev };
      const list = Array.isArray(next.education) ? [...next.education] : [];
      if (!list[index]) {
        list[index] = { school: "", degree: "", period: "" };
      }
      list[index][field] = value;
      next.education = list;
      return next;
    });
  };

  const skillText = useMemo(() => {
    return Array.isArray(draftData.skills)
      ? draftData.skills.join(", ")
      : "";
  }, [draftData.skills]);

  const handleSkillChange = (text: string) => {
    setDraftData((prev) => ({
      ...prev,
      skills: text
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border rounded-2xl border-slate-200 shadow-sm p-6 space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">
          AI Profile Builder
        </h1>
        <p className="text-sm text-slate-600">
          Describe the role you are targeting and select a template. AI will
          generate a tailored profile you can edit before exporting to PDF.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Target field
            </label>
            <input
              className="w-full mt-1 px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={form.field}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, field: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              Position
            </label>
            <input
              className="w-full mt-1 px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={form.position}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, position: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              Style
            </label>
            <input
              className="w-full mt-1 px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={form.style}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, style: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">
              Language
            </label>
            <input
              className="w-full mt-1 px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={form.language}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, language: e.target.value }))
              }
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">
            Additional notes
          </label>
          <textarea
            className="w-full mt-1 px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            rows={3}
            value={form.notes}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, notes: e.target.value }))
            }
          />
        </div>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-sm font-medium text-slate-700">
              Template
            </label>
            <select
              className="w-full mt-1 px-3 py-2 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
            >
              {templateOptions}
            </select>
          </div>
          <button
            type="button"
            className="px-4 py-2 text-sm font-semibold text-white transition rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? "Generating..." : "Generate with AI"}
          </button>
        </div>
        {error && (
          <div className="px-3 py-2 text-sm border rounded border-rose-200 bg-rose-50 text-rose-600">
            {error}
          </div>
        )}
      </div>

      {draft && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <div className="bg-white border rounded-2xl border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900">
                  Edit profile content
                </h2>
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save changes"}
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Full name
                  </label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-sm border rounded-lg border-slate-300"
                    value={draftData.name || ""}
                    onChange={(e) => updateField("name", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Headline
                  </label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-sm border rounded-lg border-slate-300"
                    value={draftData.headline || ""}
                    onChange={(e) => updateField("headline", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Contact block
                  </label>
                  <input
                    className="w-full mt-1 px-3 py-2 text-sm border rounded-lg border-slate-300"
                    value={draftData.contact_block || ""}
                    onChange={(e) => updateField("contact_block", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Summary
                  </label>
                  <textarea
                    className="w-full mt-1 px-3 py-2 text-sm border rounded-lg border-slate-300"
                    rows={4}
                    value={draftData.summary || ""}
                    onChange={(e) => updateField("summary", e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Skills (comma separated)
                  </label>
                  <textarea
                    className="w-full mt-1 px-3 py-2 text-sm border rounded-lg border-slate-300"
                    rows={2}
                    value={skillText}
                    onChange={(e) => handleSkillChange(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white border rounded-2xl border-slate-200 shadow-sm p-5 space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Experience
              </h3>
              {[0, 1].map((index) => {
                const exp = draftData.experiences?.[index] || {};
                return (
                  <div
                    key={index}
                    className="p-3 border rounded-xl border-slate-100 space-y-2"
                  >
                    <div className="flex gap-3">
                      <input
                        className="flex-1 px-3 py-2 text-sm border rounded-lg border-slate-300"
                        placeholder="Title"
                        value={exp.title || ""}
                        onChange={(e) =>
                          updateExperience(index, "title", e.target.value)
                        }
                      />
                      <input
                        className="flex-1 px-3 py-2 text-sm border rounded-lg border-slate-300"
                        placeholder="Company"
                        value={exp.company || ""}
                        onChange={(e) =>
                          updateExperience(index, "company", e.target.value)
                        }
                      />
                    </div>
                    <input
                      className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300"
                      placeholder="Period"
                      value={exp.period || ""}
                      onChange={(e) =>
                        updateExperience(index, "period", e.target.value)
                      }
                    />
                    <textarea
                      className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300"
                      rows={3}
                      placeholder="Achievements (one per line)"
                      value={(exp.achievements || []).join("\n")}
                      onChange={(e) =>
                        updateExperience(index, "achievements", e.target.value)
                      }
                    />
                  </div>
                );
              })}
            </div>

            <div className="bg-white border rounded-2xl border-slate-200 shadow-sm p-5 space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Projects
              </h3>
              {[0, 1].map((index) => {
                const project = draftData.projects?.[index] || {};
                return (
                  <div
                    key={`project-${index}`}
                    className="p-3 border rounded-xl border-slate-100 space-y-2"
                  >
                    <input
                      className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300"
                      placeholder="Project name"
                      value={project.name || ""}
                      onChange={(e) =>
                        updateProject(index, "name", e.target.value)
                      }
                    />
                    <textarea
                      className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300"
                      rows={3}
                      placeholder="Short description"
                      value={project.description || ""}
                      onChange={(e) =>
                        updateProject(index, "description", e.target.value)
                      }
                    />
                  </div>
                );
              })}
            </div>

            <div className="bg-white border rounded-2xl border-slate-200 shadow-sm p-5 space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Education
              </h3>
              {[0, 1].map((index) => {
                const edu = draftData.education?.[index] || {};
                return (
                  <div
                    key={`education-${index}`}
                    className="p-3 border rounded-xl border-slate-100 space-y-2"
                  >
                    <input
                      className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300"
                      placeholder="School / Institution"
                      value={edu.school || ""}
                      onChange={(e) =>
                        updateEducation(index, "school", e.target.value)
                      }
                    />
                    <input
                      className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300"
                      placeholder="Degree / Program"
                      value={edu.degree || ""}
                      onChange={(e) =>
                        updateEducation(index, "degree", e.target.value)
                      }
                    />
                    <input
                      className="w-full px-3 py-2 text-sm border rounded-lg border-slate-300"
                      placeholder="Period"
                      value={edu.period || ""}
                      onChange={(e) =>
                        updateEducation(index, "period", e.target.value)
                      }
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-white border rounded-2xl border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">
                  Preview
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm font-medium text-slate-700 border rounded-lg border-slate-200 hover:bg-slate-50 disabled:opacity-60"
                    onClick={() => draft && refreshPreview(draft.id, selectedTemplate)}
                    disabled={!draft || rendering}
                  >
                    {rendering ? "Rendering..." : "Refresh"}
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg bg-blue-600 hover:bg-blue-700"
                    onClick={handleDownloadPdf}
                    disabled={!preview}
                  >
                    Download PDF
                  </button>
                </div>
              </div>
              <div className="overflow-auto border rounded-xl border-slate-200 bg-slate-100 p-3">
                {preview ? (
                  <div
                    ref={previewRef}
                    className="bg-white shadow-md"
                    style={{ width: "900px", margin: "0 auto" }}
                  >
                    <style>{preview.css}</style>
                    <div dangerouslySetInnerHTML={{ __html: preview.html }} />
                  </div>
                ) : (
                  <div className="py-12 text-center text-sm text-slate-500">
                    Generate or refresh to see preview.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileBuilderPage;
