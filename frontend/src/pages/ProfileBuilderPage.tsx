import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  generateProfileDraft,
  listProfileTemplates,
  listProfileDraftsForUser,
  deleteProfileDraft,
  getProfileDraft,
  ProfileBlockState,
  ProfileDraft,
  ProfileDraftSummary,
  ProfileGeneratePayload,
  ProfileTemplate,
  ProfileTemplateContract,
  renderProfileDraft,
  exportProfilePdf,
  updateProfileDraft,
} from "../services/backend";
import { addBuilderCv } from "../lib/profileStore";
import { useAuth } from "../context/AuthContext";

type DraftData = {
  name: string;
  headline: string;
  contact_block: string;
  summary: string;
  photo_data_url?: string;
  experiences: Array<{
    title: string;
    company: string;
    period: string;
    achievements: string[];
  }>;
  skills: SkillEntry[] | string[];
  projects: Array<{ name: string; description: string }>;
  education: Array<{ school: string; degree: string; period: string }>;
  certifications: Array<{ name: string; issuer: string; period: string }>;
  [key: string]: any;
};

type SkillEntry = {
  name: string;
  level: number;
};

type EditorSection = {
  id: string;
  label: string;
  content: React.ReactNode;
};

const emptyDraftData: DraftData = {
  name: "",
  headline: "",
  contact_block: "",
  summary: "",
  photo_data_url: "",
  experiences: [],
  skills: [],
  projects: [],
  education: [],
  certifications: [],
};

type DraftDataInput =
  | Partial<DraftData>
  | Record<string, any>
  | null
  | undefined;

const AUTOSAVE_DELAY = 1200;

const ProfileBuilderPage: React.FC = () => {
  const { user } = useAuth();
  const allowProfileCv = user?.role === "student";
  const [templates, setTemplates] = useState<ProfileTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [draftSummaries, setDraftSummaries] = useState<ProfileDraftSummary[]>(
    []
  );
  const [loadingDraftSummaries, setLoadingDraftSummaries] = useState(false);
  const [activeTab, setActiveTab] = useState<"builder" | "drafts">("builder");
  const [form, setForm] = useState<ProfileGeneratePayload>({
    field: "",
    position: "",
    style: "modern",
    language: "English",
    notes: "",
  });
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [draftData, setDraftData] = useState<DraftData>(emptyDraftData);
  const [blockStates, setBlockStates] = useState<ProfileBlockState[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [preview, setPreview] = useState<{ html: string; css: string } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [cvNotice, setCvNotice] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [activeEditorIndex, setActiveEditorIndex] = useState(0);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [chipInputs, setChipInputs] = useState<Record<string, string>>({
    skills: "",
  });
  const previewRef = useRef<HTMLDivElement>(null);
  const autosaveTimer = useRef<number | null>(null);

  const activeTemplate = useMemo(
    () => templates.find((tpl) => tpl.id === selectedTemplate),
    [templates, selectedTemplate]
  );

  const buildDefaultBlocks = useCallback(
    (contract?: ProfileTemplateContract): ProfileBlockState[] => {
      const contractBlocks = contract?.blocks ?? [];
      if (!contractBlocks.length) return [];
      const defaultOrder =
        contract?.default_order ?? contractBlocks.map((block) => block.id);
      const orderMap = new Map<string, number>();
      defaultOrder.forEach((id, index) => orderMap.set(id, index));
      const ordered = [...contractBlocks].sort((a, b) => {
        const aWeight = orderMap.get(a.id) ?? defaultOrder.length;
        const bWeight = orderMap.get(b.id) ?? defaultOrder.length;
        return aWeight - bWeight;
      });
      return ordered.map((block, index) => ({
        id: block.id,
        label: block.label ?? block.id.replace(/_/g, " "),
        type: block.type ?? "single",
        placement: block.placement ?? "main",
        enabled: !block.optional,
        order: index,
        config: block,
      }));
    },
    []
  );

  const reconcileBlocks = useCallback(
    (
      incoming: ProfileBlockState[] | undefined,
      contract?: ProfileTemplateContract
    ): ProfileBlockState[] => {
      const defaults = buildDefaultBlocks(contract);
      if (!defaults.length) return incoming ?? [];
      if (!incoming?.length) return defaults;
      const defaultMap = new Map(defaults.map((block) => [block.id, block]));
      const merged: ProfileBlockState[] = [];
      const seen = new Set<string>();
      incoming.forEach((block) => {
        const base = defaultMap.get(block.id);
        if (!base || seen.has(block.id)) {
          return;
        }
        merged.push({
          ...base,
          ...block,
          config: base.config,
        });
        seen.add(block.id);
      });
      defaults.forEach((block) => {
        if (!seen.has(block.id)) {
          merged.push(block);
        }
      });
      return merged.map((block, index) => ({ ...block, order: index }));
    },
    [buildDefaultBlocks]
  );

  const createEmptyEntry = useCallback((block?: ProfileBlockState) => {
    if (!block?.config?.fields) {
      return {};
    }
    return block.config.fields.reduce<Record<string, any>>((acc, field) => {
      acc[field.id] = field.id === "achievements" ? [] : "";
      return acc;
    }, {});
  }, []);


  const normalizeSkillsArray = (value: any): SkillEntry[] => {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((entry) => {
      if (entry && typeof entry === "object") {
        return {
          name: entry.name || entry.label || "",
          level: typeof entry.level === "number" ? entry.level : 80,
        };
      }
      return { name: String(entry ?? ""), level: 80 };
    });
  };

  const normalizeDraftData = useCallback(
    (data: DraftDataInput, blocks: ProfileBlockState[]): DraftData => {
      const base: DraftData = {
        ...emptyDraftData,
        ...((data || {}) as Partial<DraftData>),
      };
      if (typeof base.photo_data_url !== "string") {
        base.photo_data_url = "";
      }
      blocks.forEach((block) => {
        if (block.type === "repeatable") {
          const list = Array.isArray(base[block.id]) ? [...base[block.id]] : [];
          const minItems = block.config?.min ?? 0;
          while (list.length < minItems) {
            list.push(createEmptyEntry(block));
          }
          base[block.id] = list;
        }
        if (block.type === "chip-list") {
          if (block.id === "skills") {
            base[block.id] = normalizeSkillsArray(base[block.id]);
          } else {
            base[block.id] = Array.isArray(base[block.id])
              ? base[block.id]
              : [];
          }
        }
        if (block.type === "single") {
          base[block.id] =
            typeof base[block.id] === "string" ? base[block.id] : "";
        }
      });
      return base;
    },
    [createEmptyEntry]
  );

  const fetchPreview = useCallback(
    async (draftId: number, templateId?: string) => {
      setRendering(true);
      try {
        const res = await renderProfileDraft(draftId, templateId);
        setPreview({ html: res.data.html, css: res.data.css });
      } catch (err: any) {
        setError(
          err?.response?.data?.detail ||
            "Failed to render preview. Please try again."
        );
      } finally {
        setRendering(false);
      }
    },
    []
  );

  const handleSaveDraft = useCallback(
    async (options?: { silent?: boolean; syncPreview?: boolean }) => {
      if (!draft) return;
      if (!options?.silent) {
        setSaving(true);
      }
      setError(null);
      try {
        const res = await updateProfileDraft(draft.id, {
          template_id: selectedTemplate,
          data: draftData,
          blocks: blockStates,
        });
        setDraft(res.data);
        const alignedBlocks = reconcileBlocks(
          res.data.blocks,
          activeTemplate?.contract
        );
        setBlockStates(alignedBlocks);
        setDraftData(normalizeDraftData(res.data.data, alignedBlocks));
        setIsDirty(false);
        setLastSavedAt(new Date().toISOString());
        if (options?.syncPreview !== false) {
          await fetchPreview(res.data.id, selectedTemplate);
        }
        loadDraftSummaries();
      } catch (err: any) {
        if (!options?.silent) {
          setError(
            err?.response?.data?.detail ||
              "Failed to save changes. Please try again."
          );
        } else {
          console.error(err);
        }
      } finally {
        if (!options?.silent) {
          setSaving(false);
        }
      }
    },
    [
      draft,
      blockStates,
      draftData,
      selectedTemplate,
      reconcileBlocks,
      activeTemplate?.contract,
      normalizeDraftData,
      fetchPreview,
    ]
  );

  const loadDraftSummaries = useCallback(async () => {
    setLoadingDraftSummaries(true);
    try {
      const res = await listProfileDraftsForUser();
      setDraftSummaries(res.data || []);
    } catch (err) {
      console.error("Failed to load drafts", err);
    } finally {
      setLoadingDraftSummaries(false);
    }
  }, []);

  useEffect(() => {
    listProfileTemplates()
      .then((res) => {
        setTemplates(res.data || []);
        if (!selectedTemplate && res.data?.length) {
          setSelectedTemplate(res.data[0].id);
        }
      })
      .catch(() => setError("Failed to load templates."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDraftSummaries();
  }, [loadDraftSummaries]);

  useEffect(() => {
    if (draft) {
      const alignedBlocks = reconcileBlocks(
        draft.blocks,
        activeTemplate?.contract
      );
      setBlockStates(alignedBlocks);
      setDraftData(normalizeDraftData(draft.data, alignedBlocks));
    } else {
      setBlockStates(buildDefaultBlocks(activeTemplate?.contract));
      setDraftData(emptyDraftData);
    }
  }, [
    draft,
    activeTemplate?.contract,
    buildDefaultBlocks,
    normalizeDraftData,
    reconcileBlocks,
  ]);

  useEffect(() => {
    if (draft) {
      fetchPreview(draft.id, selectedTemplate);
    }
  }, [draft?.id, selectedTemplate, fetchPreview]);

  useEffect(() => {
    if (!draft || !isDirty) return;
    if (autosaveTimer.current) {
      window.clearTimeout(autosaveTimer.current);
    }
    autosaveTimer.current = window.setTimeout(() => {
      handleSaveDraft({ silent: true, syncPreview: false });
    }, AUTOSAVE_DELAY);
    return () => {
      if (autosaveTimer.current) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
    };
  }, [draft, isDirty, handleSaveDraft]);

  const templateOptions = useMemo(
    () =>
      templates.map((tpl) => (
        <option key={tpl.id} value={tpl.id}>
          {tpl.name}
        </option>
      )),
    [templates]
  );

  const templateNameById = useMemo(() => {
    const map = new Map<string, string>();
    templates.forEach((tpl) => map.set(tpl.id, tpl.name));
    return map;
  }, [templates]);

  const sortedBlocks = useMemo(
    () => [...blockStates].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [blockStates]
  );

  const enabledBlocks = useMemo(
    () => sortedBlocks.filter((block) => block.enabled),
    [sortedBlocks]
  );

  const hasBlockManagerSection = sortedBlocks.length > 0;
  const totalEditorSections = draft
    ? 1 + (hasBlockManagerSection ? 1 : 0) + enabledBlocks.length
    : 0;

  useEffect(() => {
    setActiveEditorIndex((prev) => {
      if (totalEditorSections === 0) return 0;
      return Math.min(prev, totalEditorSections - 1);
    });
  }, [totalEditorSections]);

  useEffect(() => {
    setActiveEditorIndex(0);
  }, [draft?.id, activeTab]);

  const updateField = useCallback((field: string, value: any) => {
    setDraftData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  const handlePhotoUpload = useCallback(
    (file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setPhotoError("Please choose an image file (PNG, JPG, SVG...).");
        return;
      }
      const MAX_BYTES = 2 * 1024 * 1024;
      if (file.size > MAX_BYTES) {
        setPhotoError("Please choose an image smaller than 2MB.");
        return;
      }
      setPhotoError(null);
      const reader = new FileReader();
      reader.onload = () => {
        const result = typeof reader.result === "string" ? reader.result : "";
        updateField("photo_data_url", result);
      };
      reader.readAsDataURL(file);
    },
    [updateField]
  );

  const handleRemovePhoto = useCallback(() => {
    setPhotoError(null);
    updateField("photo_data_url", "");
  }, [updateField]);

  const handleGenerate = useCallback(async () => {
    if (!form.field.trim() || !form.position.trim()) {
      setError("Please enter both field and position.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: ProfileGeneratePayload = {
        ...form,
        template_id: selectedTemplate || undefined,
      };
      const res = await generateProfileDraft(payload);
      setDraft(res.data);
      setSelectedTemplate(res.data.template_id);
      const alignedBlocks = reconcileBlocks(
        res.data.blocks,
        templates.find((tpl) => tpl.id === res.data.template_id)?.contract
      );
      setBlockStates(alignedBlocks);
      setDraftData(normalizeDraftData(res.data.data, alignedBlocks));
      setIsDirty(false);
      setLastSavedAt(new Date().toISOString());
      await fetchPreview(res.data.id, res.data.template_id);
      loadDraftSummaries();
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
          "Failed to generate profile. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }, [
    form,
    selectedTemplate,
    reconcileBlocks,
    templates,
    normalizeDraftData,
    fetchPreview,
    loadDraftSummaries,
  ]);

  const handleResumeDraft = useCallback(
    async (draftId: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await getProfileDraft(draftId);
        setDraft(res.data);
        setSelectedTemplate(res.data.template_id);
        const templateContract = templates.find(
          (tpl) => tpl.id === res.data.template_id
        )?.contract;
        const alignedBlocks = reconcileBlocks(
          res.data.blocks,
          templateContract
        );
        setBlockStates(alignedBlocks);
        setDraftData(normalizeDraftData(res.data.data, alignedBlocks));
        setActiveTab("builder");
        setIsDirty(false);
        setLastSavedAt(res.data.updated_at || null);
        await fetchPreview(res.data.id, res.data.template_id);
      } catch (err: any) {
        setError(
          err?.response?.data?.detail ||
            "Unable to resume this draft. Please try again."
        );
      } finally {
        setLoading(false);
      }
    },
    [templates, reconcileBlocks, normalizeDraftData, fetchPreview]
  );

  const handleDeleteDraft = useCallback(
    async (draftId: number) => {
      try {
        await deleteProfileDraft(draftId);
        if (draft?.id === draftId) {
          setDraft(null);
          setDraftData(emptyDraftData);
          setPreview(null);
        }
        loadDraftSummaries();
      } catch (err: any) {
        setError(
          err?.response?.data?.detail ||
            "Failed to delete draft. Please try again."
        );
      }
    },
    [draft, loadDraftSummaries]
  );

  const handleMoveBlock = useCallback((blockId: string, direction: number) => {
    setBlockStates((prev) => {
      const next = [...prev].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const currentIndex = next.findIndex((block) => block.id === blockId);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= next.length) {
        return prev;
      }
      [next[currentIndex], next[targetIndex]] = [
        next[targetIndex],
        next[currentIndex],
      ];
      return next.map((block, index) => ({ ...block, order: index }));
    });
    setIsDirty(true);
  }, []);

  const handleToggleBlock = useCallback(
    (block: ProfileBlockState, next: boolean) => {
      if (!next && block.config?.required && !block.config?.removable) {
        return;
      }
      setBlockStates((prev) =>
        prev.map((item) =>
          item.id === block.id ? { ...item, enabled: next } : item
        )
      );
      setIsDirty(true);
    },
    []
  );

  const handleAddEntry = useCallback(
    (block: ProfileBlockState) => {
      setDraftData((prev) => {
        const list = Array.isArray(prev[block.id]) ? [...prev[block.id]] : [];
        list.push(createEmptyEntry(block));
        return { ...prev, [block.id]: list };
      });
      setIsDirty(true);
    },
    [createEmptyEntry]
  );

  const handleRemoveEntry = useCallback(
    (block: ProfileBlockState, index: number) => {
      setDraftData((prev) => {
        const list = Array.isArray(prev[block.id]) ? [...prev[block.id]] : [];
        const minItems = block.config?.min ?? 0;
        if (list.length <= minItems) {
          return prev;
        }
        list.splice(index, 1);
        return { ...prev, [block.id]: list };
      });
      setIsDirty(true);
    },
    []
  );

  const handleEntryFieldChange = useCallback(
    (blockId: string, index: number, fieldId: string, value: string) => {
      setDraftData((prev) => {
        const list = Array.isArray(prev[blockId]) ? [...prev[blockId]] : [];
        if (!list[index]) {
          list[index] = {};
        }
        list[index] = {
          ...list[index],
          [fieldId]:
            fieldId === "achievements"
              ? value
                  .split("\n")
                  .map((line) => line.trim())
                  .filter(Boolean)
              : value,
        };
        return { ...prev, [blockId]: list };
      });
      setIsDirty(true);
    },
    []
  );

  const handleAddChip = useCallback(
    (block: ProfileBlockState) => {
      const rawValue = (chipInputs[block.id] ?? "").trim();
      if (!rawValue) return;
      const maxItems = block.config?.max ?? Infinity;
      setDraftData((prev) => {
        const list = Array.isArray(prev[block.id]) ? [...prev[block.id]] : [];
        if (list.length >= maxItems) {
          return prev;
        }
        if (block.id === "skills") {
          list.push({ name: rawValue, level: 80 });
        } else {
          list.push(rawValue);
        }
        return { ...prev, [block.id]: list };
      });
      setChipInputs((prev) => ({ ...prev, [block.id]: "" }));
      setIsDirty(true);
    },
    [chipInputs]
  );

  const handleRemoveChip = useCallback((blockId: string, index: number) => {
    setDraftData((prev) => {
      const list = Array.isArray(prev[blockId]) ? [...prev[blockId]] : [];
      list.splice(index, 1);
      return { ...prev, [blockId]: list };
    });
    setIsDirty(true);
  }, []);

  const handleChipLevelChange = useCallback(
    (blockId: string, index: number, level: number) => {
      setDraftData((prev) => {
        const list = Array.isArray(prev[blockId]) ? [...prev[blockId]] : [];
        const entry = { ...(list[index] || {}) };
        entry.level = Math.max(0, Math.min(100, level));
        list[index] = entry;
        return { ...prev, [blockId]: list };
      });
      setIsDirty(true);
    },
    []
  );

  const handleDownloadPdf = useCallback(async () => {
    if (!draft) return;
    try {
      const res = await exportProfilePdf(draft.id, selectedTemplate);
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `profile-${draft.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail || "Failed to export PDF. Please try again."
      );
    }
  }, [draft, selectedTemplate]);

  const handleAddDraftToProfile = useCallback(() => {
    if (!allowProfileCv) return;
    if (!draft) {
      setError("Generate and save a draft before adding it to My CVs.");
      return;
    }
    addBuilderCv({
      draftId: draft.id,
      name: draftData.name || `Draft ${draft.id}`,
      templateId: selectedTemplate,
    });
    setCvNotice("Added to My CVs.");
    setTimeout(() => setCvNotice(null), 2500);
  }, [allowProfileCv, draft, draftData.name, selectedTemplate]);

  const renderProfileInfoSection = () => (
    <div className="p-5 space-y-4 bg-white border shadow-sm rounded-2xl border-slate-200">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Edit profile content
        </h2>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium text-slate-700">
            Full name
          </label>
          <input
            className="w-full px-3 py-2 mt-1 text-sm border rounded-lg border-slate-300"
            value={draftData.name || ""}
            onChange={(e) => updateField("name", e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">Headline</label>
          <input
            className="w-full px-3 py-2 mt-1 text-sm border rounded-lg border-slate-300"
            value={draftData.headline || ""}
            onChange={(e) => updateField("headline", e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">
            Contact block
          </label>
          <input
            className="w-full px-3 py-2 mt-1 text-sm border rounded-lg border-slate-300"
            value={draftData.contact_block || ""}
            onChange={(e) => updateField("contact_block", e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700">
            Profile photo
          </label>
          <div className="flex flex-wrap items-center gap-4 mt-2">
            <div className="flex items-center justify-center w-20 h-20 overflow-hidden border rounded-full border-slate-200 bg-slate-100">
              {draftData.photo_data_url ? (
                <img
                  src={draftData.photo_data_url}
                  alt="Profile preview"
                  className="object-cover w-full h-full"
                />
              ) : (
                <span className="text-2xl text-slate-400">👤</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <input
                type="file"
                accept="image/*"
                className="text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  handlePhotoUpload(file);
                  e.target.value = "";
                }}
              />
              {draftData.photo_data_url && (
                <button
                  type="button"
                  className="self-start text-sm text-rose-600 hover:underline"
                  onClick={handleRemovePhoto}
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>
          {photoError && (
            <p className="mt-1 text-xs text-rose-600">{photoError}</p>
          )}
        </div>
      </div>
    </div>
  );

  const renderBlockManager = () => {
    if (!sortedBlocks.length) return null;
    return (
      <div className="p-5 space-y-4 bg-white border shadow-sm rounded-2xl border-slate-200">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Sections & ordering
          </h3>
          <p className="text-sm text-slate-500">
            Use the controls to reorder or hide sections from the template.
          </p>
        </div>
        <div className="space-y-3">
          {sortedBlocks.map((block, index) => {
            const canDisable =
              !block.config?.required || Boolean(block.config?.removable);
            const isFirst = index === 0;
            const isLast = index === sortedBlocks.length - 1;
            return (
              <div
                key={block.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3 border rounded-xl border-slate-100 bg-slate-50"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {block.label}
                  </p>
                  <p className="text-xs text-slate-500">
                    {block.placement === "side"
                      ? "Sidebar section"
                      : "Main column"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-2 py-1 text-xs font-medium border rounded-lg text-slate-600 border-slate-200 disabled:opacity-40"
                    onClick={() => handleMoveBlock(block.id, -1)}
                    disabled={isFirst}
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 text-xs font-medium border rounded-lg text-slate-600 border-slate-200 disabled:opacity-40"
                    onClick={() => handleMoveBlock(block.id, 1)}
                    disabled={isLast}
                  >
                    Down
                  </button>
                  <button
                    type="button"
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg ${
                      block.enabled
                        ? "text-emerald-700 bg-emerald-100"
                        : "text-slate-600 bg-slate-200"
                    }`}
                    onClick={() => handleToggleBlock(block, !block.enabled)}
                    disabled={!canDisable && block.enabled}
                  >
                    {block.enabled ? "Visible" : "Hidden"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderFieldControl = (
    blockId: string,
    field: { id: string; label: string; type?: string; maxLength?: number },
    value: string,
    index?: number
  ) => {
    const commonProps = {
      className:
        "w-full px-3 py-2 mt-1 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100",
      maxLength: field.maxLength,
      value,
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      ) =>
        typeof index === "number"
          ? handleEntryFieldChange(blockId, index, field.id, e.target.value)
          : updateField(field.id, e.target.value),
    };
    if (field.type === "textarea") {
      return <textarea {...commonProps} rows={3} />;
    }
    return <input {...commonProps} />;
  };

  const renderBlockEditor = (block: ProfileBlockState) => {
    if (block.type === "repeatable") {
      const entries = Array.isArray(draftData[block.id])
        ? (draftData[block.id] as Record<string, any>[])
        : [];
      const maxItems = block.config?.max ?? Infinity;
      const minItems = block.config?.min ?? 0;
      return (
        <div
          key={block.id}
          className="p-5 space-y-4 bg-white border shadow-sm rounded-2xl border-slate-200"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              {block.label}
            </h3>
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-slate-800 disabled:opacity-40"
              onClick={() => handleAddEntry(block)}
              disabled={entries.length >= maxItems}
            >
              Add {block.config?.item_label || "Entry"}
            </button>
          </div>
          {entries.length === 0 ? (
            <p className="text-sm text-slate-500">
              No entries yet. Use “Add" to insert the first one.
            </p>
          ) : (
            <div className="space-y-4">
              {entries.map((entry: Record<string, any>, idx: number) => (
                <div
                  key={`${block.id}-${idx}`}
                  className="p-4 space-y-3 border bg-slate-50 rounded-xl border-slate-100"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">
                      {block.config?.item_label || "Entry"} #{idx + 1}
                    </p>
                    <button
                      type="button"
                      className="px-2 py-1 text-xs font-semibold border rounded-lg text-rose-600 border-rose-200 disabled:opacity-40"
                      onClick={() => handleRemoveEntry(block, idx)}
                      disabled={entries.length <= minItems}
                    >
                      Remove
                    </button>
                  </div>
                  {(block.config?.fields || []).map((field) => {
                    const rawValue = entry[field.id];
                    const displayValue =
                      field.id === "achievements" && Array.isArray(rawValue)
                        ? rawValue.join("\n")
                        : rawValue ?? "";
                    return (
                      <div key={field.id}>
                        <label className="text-xs font-medium text-slate-600">
                          {field.label}
                        </label>
                        {renderFieldControl(block.id, field, displayValue, idx)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (block.type === "chip-list") {
      const items = Array.isArray(draftData[block.id])
        ? (draftData[block.id] as any[])
        : [];
      const maxItems = block.config?.max ?? Infinity;
      const isSkillBlock = block.id === "skills";
      return (
        <div
          key={block.id}
          className="p-5 space-y-4 bg-white border shadow-sm rounded-2xl border-slate-200"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">
              {block.label}
            </h3>
            <span className="text-xs text-slate-500">
              {items.length}/{isFinite(maxItems) ? maxItems : "∞"}
            </span>
          </div>
          <div className="space-y-3">
            {items.length === 0 && (
              <p className="text-sm text-slate-500">No entries yet.</p>
            )}
            {items.map((entry: any, idx: number) => (
              <div
                key={`${block.id}-chip-${idx}`}
                className="flex flex-wrap items-center gap-3 p-3 border bg-slate-50 rounded-xl border-slate-100"
              >
                <input
                  className="flex-1 px-3 py-2 text-sm border rounded-lg border-slate-300"
                  value={isSkillBlock ? entry?.name || "" : entry || ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    setDraftData((prev) => {
                      const list = Array.isArray(prev[block.id])
                        ? [...prev[block.id]]
                        : [];
                      if (isSkillBlock) {
                        list[idx] = {
                          ...(list[idx] || {}),
                          name: value,
                          level: list[idx]?.level ?? 80,
                        };
                      } else {
                        list[idx] = value;
                      }
                      return { ...prev, [block.id]: list };
                    });
                    setIsDirty(true);
                  }}
                />
                {isSkillBlock && (
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      className="w-20 px-2 py-1 text-sm border rounded-lg border-slate-300"
                      value={entry?.level ?? 0}
                      onChange={(e) =>
                        handleChipLevelChange(
                          block.id,
                          idx,
                          Number(e.target.value)
                        )
                      }
                    />
                    <div className="flex-1 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${entry?.level ?? 0}%` }}
                      />
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className="px-2 py-1 text-xs font-semibold border rounded-lg text-rose-600 border-rose-200"
                  onClick={() => handleRemoveChip(block.id, idx)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="flex-1 px-3 py-2 text-sm border rounded-lg border-slate-300"
              placeholder={`Add ${block.label}`}
              value={chipInputs[block.id] ?? ""}
              onChange={(e) =>
                setChipInputs((prev) => ({
                  ...prev,
                  [block.id]: e.target.value,
                }))
              }
            />
            <button
              type="button"
              className="px-3 py-2 text-sm font-semibold text-white rounded-lg bg-slate-800 disabled:opacity-40"
              onClick={() => handleAddChip(block)}
              disabled={items.length >= maxItems}
            >
              Add
            </button>
          </div>
        </div>
      );
    }

    const fields = block.config?.fields || [
      { id: block.id, label: block.label, type: "textarea" },
    ];
    return (
      <div
        key={block.id}
        className="p-5 space-y-3 bg-white border shadow-sm rounded-2xl border-slate-200"
      >
        <h3 className="text-base font-semibold text-slate-900">
          {block.label}
        </h3>
        {fields.map((field) => {
          const value =
            typeof draftData[field.id] === "string"
              ? (draftData[field.id] as string)
              : "";
          return (
            <div key={field.id}>
              <label className="text-xs font-medium text-slate-600">
                {field.label}
              </label>
              {renderFieldControl(block.id, field, value)}
            </div>
          );
        })}
      </div>
    );
  };

  const blockManagerSection = renderBlockManager();
  const editorSections: EditorSection[] = [];

  if (draft) {
    editorSections.push({
      id: "profile-info",
      label: "Edit profile content",
      content: renderProfileInfoSection(),
    });
    if (blockManagerSection) {
      editorSections.push({
        id: "block-manager",
        label: "Sections & ordering",
        content: blockManagerSection,
      });
    }
    enabledBlocks.forEach((block) => {
      editorSections.push({
        id: `block-${block.id}`,
        label: block.label,
        content: renderBlockEditor(block),
      });
    });
  }

  const currentSection = editorSections[activeEditorIndex];
  const canGoPrev = activeEditorIndex > 0;
  const canGoNext = activeEditorIndex < editorSections.length - 1;

  return (
    <div className="space-y-6">
      <div className="bg-white border shadow-sm rounded-2xl border-slate-200">
        <div className="px-6 pt-6">
          <h1 className="text-2xl font-semibold text-slate-900">
            AI Profile Builder
          </h1>
          <p className="text-sm text-slate-600">
            Describe the role you are targeting and select a template. AI will
            generate a tailored profile you can edit before exporting to PDF.
          </p>
        </div>
        <div className="flex gap-4 px-6 mt-6 border-b border-slate-200">
          {["builder", "drafts"].map((tab) => (
            <button
              key={tab}
              type="button"
              className={`px-3 pb-3 text-sm font-semibold border-b-2 ${
                activeTab === tab
                  ? "text-blue-600 border-blue-600"
                  : "text-slate-500 border-transparent hover:text-slate-700"
              }`}
              onClick={() => setActiveTab(tab as "builder" | "drafts")}
            >
              {tab === "builder" ? "AI Profile Builder" : "Saved drafts"}
            </button>
          ))}
        </div>
        {activeTab === "builder" && (
          <div className="p-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Field
                </label>
                <input
                  className="w-full px-3 py-2 mt-1 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
                  className="w-full px-3 py-2 mt-1 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
                  className="w-full px-3 py-2 mt-1 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
                  className="w-full px-3 py-2 mt-1 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
                className="w-full px-3 py-2 mt-1 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                rows={3}
                value={form.notes}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, notes: e.target.value }))
                }
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Template
                </label>
                <select
                  className="w-full px-3 py-2 mt-1 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                >
                  {templateOptions}
                </select>
              </div>
              <button
                type="button"
                className="px-4 py-2 text-sm font-semibold text-white transition bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
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
        )}
        {activeTab === "drafts" && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Saved drafts
                </h2>
                <p className="text-sm text-slate-500">
                  Resume where you left off or remove drafts you no longer need.
                </p>
              </div>
              <button
                type="button"
                className="text-sm font-medium text-blue-600 hover:underline"
                onClick={loadDraftSummaries}
                disabled={loadingDraftSummaries}
              >
                {loadingDraftSummaries ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            {draftSummaries.length === 0 ? (
              <p className="text-sm text-slate-500">
                No drafts yet. Generate a profile to create your first draft.
              </p>
            ) : (
              <div className="space-y-3">
                {draftSummaries.map((summary) => (
                  <div
                    key={summary.id}
                    className="flex flex-wrap items-center justify-between gap-3 p-3 border rounded-xl border-slate-100"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {summary.name?.trim() || "Untitled draft"}
                      </p>
                      <p className="text-xs text-slate-500">
                        {summary.headline ||
                          templateNameById.get(summary.template_id) ||
                          summary.template_id}
                      </p>
                      {summary.updated_at && (
                        <p className="text-xs text-slate-400">
                          Updated{" "}
                          {new Date(summary.updated_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg bg-slate-800 hover:bg-slate-900"
                        onClick={() => handleResumeDraft(summary.id)}
                      >
                        Resume
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 text-xs font-semibold text-rose-600 rounded-lg border border-rose-200 hover:bg-rose-50"
                        onClick={() => handleDeleteDraft(summary.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {activeTab === "builder" && draft && (
        <div className="grid gap-6 xl:grid-cols-[1.5fr_0.5fr]">
          <div className="space-y-4">
            <div className="p-4 bg-white border shadow-sm rounded-2xl border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    {editorSections.length > 0
                      ? `Section ${activeEditorIndex + 1} of ${
                          editorSections.length
                        }`
                      : "No sections available"}
                  </p>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {currentSection?.label || "Nothing to edit yet"}
                  </h2>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm font-medium text-slate-700 border rounded-lg border-slate-200 disabled:opacity-50"
                    onClick={() =>
                      setActiveEditorIndex((prev) => Math.max(prev - 1, 0))
                    }
                    disabled={!canGoPrev}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm font-medium text-slate-700 border rounded-lg border-slate-200 disabled:opacity-50"
                    onClick={() =>
                      setActiveEditorIndex((prev) =>
                        Math.min(prev + 1, editorSections.length - 1)
                      )
                    }
                    disabled={!canGoNext}
                  >
                    Next
                  </button>
                </div>
              </div>
              {editorSections.length > 0 && (
                <div className="mt-4">
                  <label className="text-xs font-medium text-slate-500">
                    Jump to section
                  </label>
                  <select
                    className="w-full px-3 py-2 mt-1 text-sm border rounded-lg border-slate-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    value={currentSection?.id || ""}
                    onChange={(e) => {
                      const nextIndex = editorSections.findIndex(
                        (section) => section.id === e.target.value
                      );
                      if (nextIndex >= 0) {
                        setActiveEditorIndex(nextIndex);
                      }
                    }}
                  >
                    {editorSections.map((section) => (
                      <option key={section.id} value={section.id}>
                        {section.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {currentSection ? (
              <div>{currentSection.content}</div>
            ) : (
              <div className="p-5 bg-white border shadow-sm rounded-2xl border-slate-200">
                <p className="text-sm text-slate-500">
                  Generate a profile draft to begin editing sections.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="p-5 space-y-4 bg-white border shadow-sm rounded-2xl border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">
                  Preview
                </h3>
                <div className="flex gap-2">
                  {allowProfileCv && (
                    <button
                      type="button"
                      className="px-3 py-1.5 text-sm font-medium text-slate-700 border rounded-lg border-slate-200 hover:bg-slate-50 disabled:opacity-60"
                      onClick={handleAddDraftToProfile}
                      disabled={!draft}
                    >
                      Add to My CV
                    </button>
                  )}
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                    onClick={() => handleSaveDraft()}
                    disabled={!draft || saving}
                  >
                    {saving ? "Saving..." : "Save changes"}
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm font-semibold text-white rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
                    onClick={handleDownloadPdf}
                    disabled={!draft}
                  >
                    Download PDF
                  </button>
                </div>
              </div>
              {allowProfileCv && cvNotice && (
                <p className="text-xs text-emerald-600">{cvNotice}</p>
              )}
              <div className="p-3 overflow-auto border rounded-xl border-slate-200 bg-slate-100">
                {preview ? (
                  <div
                    ref={previewRef}
                    className="mx-auto bg-white shadow-md"
                    style={{ width: "900px" }}
                  >
                    <style>{preview.css}</style>
                    <div dangerouslySetInnerHTML={{ __html: preview.html }} />
                  </div>
                ) : (
                  <div className="py-12 text-sm text-center text-slate-500">
                    Generate or save to see preview.
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
