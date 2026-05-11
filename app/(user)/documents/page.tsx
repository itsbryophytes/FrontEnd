'use client';

import { useState, useRef, useCallback, useEffect } from "react";
import {
  FileUp, PenLine, FileText, X, CheckCircle, Loader2,
  FlaskConical, Pencil, Trash2, ClipboardList, FilePlus2,
  ChevronDown, ChevronUp, AlertTriangle, Image as ImageIcon, HeartPulse
} from "lucide-react";
import Button from "@/components/button";
import { ManualTracker } from "@/components/health/ManualTracker";
import { HealthRecord, EMPTY_RECORD, getStatus, MARKERS, STANDARD_FIELDS, getCategoryForLabel, formatDateToYYYYMMDD } from "@/lib/healthRecord";
import {
  uploadDocument,
  getDocuments,
  confirmDocument,
  createManualDocument,
  deleteDocument as apiDeleteDocument,
  updateDocument,
  getBloodSugarLogs,
  getBloodPressureLogs,
  getWeightLogs,
} from "@/lib/api";
import { Scale, Thermometer, Activity as BP } from "lucide-react";

type Tab = "add" | "records";
type InputMethod = "file" | "manual";
type OcrState = "idle" | "processing" | "done";
type ModalState =
  | { type: "none" }
  | { type: "edit"; record: HealthRecord }
  | { type: "delete"; id: string; name: string };

type ManualMode = "lab" | "vitals";

type DynamicParam = { label: string; value: string; unit: string };

const chipClass: Record<string, string> = {
  ok: "border-green-400/60  bg-green-50   text-green-700",
  warn: "border-amber-400/60  bg-amber-50   text-amber-700",
  bad: "border-red-400/60    bg-red-50     text-red-600",
};
const chipIcon: Record<string, string> = { ok: "✓", warn: "!", bad: "✕" };

function mapPreviewToForm(preview: any): { mapped: Partial<typeof EMPTY_RECORD> | null; dynamicFields: DynamicParam[] } {
  if (!preview) return { mapped: null, dynamicFields: [] };

  const params: Record<string, { value?: unknown; unit?: string }> = preview.parameters ?? {};
  const unmappedKeys = new Set(Object.keys(params));

  const findAndConsume = (...needles: string[]): string => {
    for (const needle of needles) {
      const key = Array.from(unmappedKeys).find(k =>
        k.toLowerCase().includes(needle.toLowerCase())
      );
      if (key != null) {
        unmappedKeys.delete(key);
        const v = params[key].value;
        return v != null ? String(v) : "";
      }
    }
    return "";
  };

  const mapped: Partial<typeof EMPTY_RECORD> = {
    reportDate: formatDateToYYYYMMDD(preview.date) ?? "",
    lab: preview.lab_name ?? "",
    glucoseFasting: findAndConsume("glucose fasting", "fasting glucose", "gula puasa"),
    glucosePostmeal: findAndConsume("postmeal", "post-meal", "post meal", "2 hour glucose", "2h glucose"),
    hba1c: findAndConsume("hba1c", "hba 1c", "hemoglobin a1c"),
    cholTotal: findAndConsume("total cholesterol", "cholesterol total"),
    cholLDL: findAndConsume("ldl"),
    cholHDL: findAndConsume("hdl"),
    triglycerides: findAndConsume("triglyceride"),
    hemoglobin: findAndConsume("hemoglobin", " hb "),
    hematocrit: findAndConsume("hematocrit", " ht "),
    wbc: findAndConsume("white blood", "leukosit", "wbc"),
    platelets: findAndConsume("platelet", "trombosit"),
    uricAcid: findAndConsume("uric acid", "asam urat"),
    creatinine: findAndConsume("creatinine", "kreatinin"),
    bun: findAndConsume("blood urea nitrogen", " bun", "urea nitrogen"),
    notes: (preview.warnings as string[] | undefined ?? []).join(", "),
  };

  const dynamicFields: DynamicParam[] = [];
  unmappedKeys.forEach(k => {
    const val = params[k].value;
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      dynamicFields.push({ label: k, value: String(val), unit: params[k].unit || "" });
    }
  });

  return { mapped, dynamicFields };
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="h-px flex-1 bg-foreground/10" />
      <span className="text-[10px] font-mono font-semibold text-foreground/40 uppercase tracking-widest whitespace-nowrap">
        {children}
      </span>
      <div className="h-px flex-1 bg-foreground/10" />
    </div>
  );
}

function FieldInput({
  label, value, type = "text", placeholder, unit, hint, autofilled, onChange,
}: {
  label: string; value: string; type?: string; placeholder?: string;
  unit?: string; hint?: string; autofilled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-mono font-semibold text-foreground/50 uppercase tracking-widest">
        {label}
      </label>
      <div className={`relative flex items-center squircle border transition-all duration-200 ${autofilled
        ? "border-green-400 bg-green-50/50"
        : "border-foreground/15 bg-background focus-within:border-richcerulean"
        }`}>
        <input
          type={type}
          step={type === "number" ? "any" : undefined}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-foreground/25"
        />
        {autofilled && (
          <span className="shrink-0 pr-3 text-[10px] font-mono text-green-600 font-semibold">
            OCR
          </span>
        )}
      </div>
      {(unit || hint) && (
        <span className="text-[10px] font-mono text-foreground/35">
          {unit}{hint && ` · ${hint}`}
        </span>
      )}
    </div>
  );
}

function ManualModeSelector({ active, onChange }: { active: ManualMode, onChange: (m: ManualMode) => void }) {
  const modes: { id: ManualMode, label: string, icon: any }[] = [
    { id: "lab", label: "Lab Result (Manual)", icon: <ClipboardList size={14} /> },
    { id: "vitals", label: "Health Vitals Tracking", icon: <HeartPulse size={14} /> },
  ];

  return (
    <div className="flex gap-2 p-1.5 bg-foreground/5 squircle border border-foreground/5">
      {modes.map(m => (
        <button
          key={m.id}
          onClick={() => onChange(m.id)}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 squircle text-[12px] font-mono font-bold uppercase transition-all duration-200 ${
            active === m.id
              ? "bg-background text-richcerulean shadow-sm border border-foreground/10"
              : "text-foreground/40 hover:text-foreground/70"
          }`}
        >
          {m.icon}
          {m.label}
        </button>
      ))}
    </div>
  );
}

function HealthForm({
  values,
  autofilled,
  dynamicParams = [],
  showEmptyFields = true,
  onChange,
  onDynamicChange,
}: {
  values: Omit<HealthRecord, "id" | "createdAt">;
  autofilled: Set<string>;
  dynamicParams?: DynamicParam[];
  showEmptyFields?: boolean;
  onChange: (field: keyof typeof EMPTY_RECORD, value: string) => void;
  onDynamicChange?: (index: number, value: string) => void;
}) {
  const af = (k: string) => autofilled.has(k);

  const groupedFields: Record<string, any[]> = {
    "Blood Sugar": [],
    "Cholesterol Panel": [],
    "Blood Count": [],
    "Kidney & Urine": [],
    "Liver Function": [],
    "Thyroid Profile": [],
    "Electrolytes & Minerals": [],
    "Immunology & Markers": [],
    "Other Tests": []
  };

  STANDARD_FIELDS.forEach(field => {
    const val = values[field.key as keyof typeof EMPTY_RECORD] as string;
    if (!showEmptyFields && !val) return;

    groupedFields[field.cat].push({
      isStandard: true,
      key: field.key,
      label: field.label,
      value: val,
      unit: field.unit,
      hint: field.hint,
    });
  });

  dynamicParams.forEach((param, index) => {
    if (!showEmptyFields && !param.value) return;

    const cat = getCategoryForLabel(param.label);
    if (groupedFields[cat]) {
      groupedFields[cat].push({
        isStandard: false,
        index: index,
        label: param.label,
        value: param.value,
        unit: param.unit
      });
    }
  });

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel>Patient Info</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <FieldInput label="Report Date" type="date" value={values.reportDate} autofilled={af("reportDate")} onChange={v => onChange("reportDate", v)} />
        <FieldInput label="Lab / Source" placeholder="e.g. Prodia" value={values.lab} autofilled={af("lab")} onChange={v => onChange("lab", v)} />
      </div>

      {Object.entries(groupedFields).map(([catName, fields]) => {
        if (fields.length === 0) return null;

        return (
          <div key={catName} className="flex flex-col gap-3">
            <SectionLabel>{catName}</SectionLabel>
            <div className="grid grid-cols-2 gap-3">
              {fields.map(f => (
                <FieldInput
                  key={f.isStandard ? f.key : `dyn-${f.index}-${f.label}`}
                  label={f.label}
                  value={f.value}
                  unit={f.unit}
                  hint={f.hint}
                  autofilled={af(f.isStandard ? f.key : f.label)}
                  onChange={v => f.isStandard ? onChange(f.key, v) : onDynamicChange?.(f.index, v)}
                />
              ))}
            </div>
          </div>
        );
      })}

      <SectionLabel>Notes</SectionLabel>
      <div className="flex flex-col gap-1.5">
        <label className="text-[10px] font-mono font-semibold text-foreground/50 uppercase tracking-widest">
          Doctor&apos;s Comments
        </label>
        <div className={`squircle border transition-all duration-200 ${af("notes")
          ? "border-green-400 bg-green-50/50"
          : "border-foreground/15 bg-background focus-within:border-richcerulean"
          }`}>
          <textarea
            value={values.notes}
            onChange={e => onChange("notes", e.target.value)}
            placeholder="Any additional notes from your doctor…"
            rows={3}
            className="w-full bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-foreground/25 resize-none"
          />
        </div>
      </div>
    </div>
  );
}

function RecordCard({
  record, onEdit, onDelete,
}: {
  record: HealthRecord;
  onEdit: (r: HealthRecord) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const standardChips = MARKERS.flatMap(([label, field, low, high, unit]) => {
    const val = record[field] as string;
    const st = getStatus(val, low, high);
    return st === "empty" ? [] : [{ label, val, unit, st }];
  });

  const dynamicChips = Object.entries(record.additionalMetrics || {}).map(([label, val]) => {
    return { label, val: String(val), unit: "", st: "ok" };
  });

  const chips = [...standardChips, ...dynamicChips];

  return (
    <div
      className="squircle bg-background border border-foreground/10 hover:border-richcerulean/40 transition-all duration-200 overflow-hidden"
      style={{ animation: "fadeUp 0.25s ease-out" }}
    >
      <div className="flex items-center justify-between px-5 py-4 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 squircle bg-richcerulean/10 flex items-center justify-center shrink-0">
            <FlaskConical size={18} className="text-richcerulean" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">
              {"Lab Result"}
            </p>
            <p className="text-[11px] font-mono text-foreground/50 mt-0.5">
              {record.reportDate} · {record.lab || "No source"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex gap-1.5">
            {chips.slice(0, 3).map((c, i) => (
              <span
                key={`${c.label}-${i}`}
                className={`px-2 py-0.5 rounded-full border text-[10px] font-mono font-medium ${chipClass[c.st]}`}
              >
                {c.label} {chipIcon[c.st]}
              </span>
            ))}
            {chips.length > 3 && (
              <span className="px-2 py-0.5 rounded-full border border-foreground/15 text-[10px] font-mono text-foreground/40">
                +{chips.length - 3}
              </span>
            )}
          </div>

          <button
            onClick={() => onEdit(record)}
            className="w-8 h-8 rounded-full border border-foreground/15 flex items-center justify-center text-foreground/40 hover:border-richcerulean hover:text-richcerulean transition-all duration-150"
            title="Edit"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(record.id, "Record")}
            className="w-8 h-8 rounded-full border border-foreground/15 flex items-center justify-center text-foreground/40 hover:border-red-400 hover:text-red-500 transition-all duration-150"
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={() => setExpanded(p => !p)}
            className="w-8 h-8 rounded-full border border-foreground/15 flex items-center justify-center text-foreground/40 hover:border-foreground/40 transition-all duration-150"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>
      </div>

      {expanded && (
        <div
          className="border-t border-foreground/10 px-5 py-4 flex flex-col gap-3"
          style={{ animation: "fadeUp 0.2s ease-out" }}
        >
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c, i) => (
              <span
                key={`${c.label}-${i}`}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-mono font-medium ${chipClass[c.st]}`}
              >
                {c.label}: {c.val} {c.unit} {chipIcon[c.st]}
              </span>
            ))}
          </div>
          {record.notes && (
            <div className="squircle bg-foreground/5 px-4 py-3">
              <p className="text-[10px] font-mono text-foreground/40 uppercase tracking-widest mb-1">Notes</p>
              <p className="text-sm text-foreground/70 leading-relaxed">{record.notes}</p>
            </div>
          )}
          <p className="text-[10px] font-mono text-foreground/30">
            Added {record.createdAt.toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}

function VitalsCard({ type, data }: { type: string, data: any }) {
  const [expanded, setExpanded] = useState(false);
  const isBS = type === 'blood_sugar';
  const isBP = type === 'blood_pressure';
  const isW = type === 'weight';

  const date = new Date(data.recorded_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div 
      onClick={() => setExpanded(!expanded)}
      className={`squircle border border-foreground/10 bg-background flex flex-col group hover:border-richcerulean/30 transition-all cursor-pointer overflow-hidden ${expanded ? 'shadow-md border-richcerulean/20' : ''}`}
    >
      <div className="p-4 flex items-center gap-4">
        <div className={`w-10 h-10 squircle flex items-center justify-center shrink-0 ${
          isBS ? 'bg-amber-50 text-amber-500' : isBP ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-500'
        }`}>
          {isBS ? <Thermometer size={18} /> : isBP ? <BP size={18} /> : <Scale size={18} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-[10px] font-mono font-bold uppercase text-foreground/30 tracking-wider">
              {type.replace('_', ' ')}
            </p>
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-mono text-foreground/40">{date}</p>
              {expanded ? <ChevronUp size={12} className="text-foreground/30" /> : <ChevronDown size={12} className="text-foreground/30" />}
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-bold text-foreground">
              {isBS ? `${data.glucose_value} mg/dL` : isBP ? `${data.systolic}/${data.diastolic} mmHg` : `${data.weight_kg} kg`}
            </span>
            <span className={`text-[10px] font-bold uppercase ${
              isBS ? (data.indicator === 'high' ? 'text-rose-500' : data.indicator === 'low' ? 'text-amber-500' : 'text-emerald-500') :
              isBP ? (
                data.classification === 'low' ? 'text-blue-500' : 
                data.classification === 'prehypertension' ? 'text-yellow-600' :
                data.classification.includes('stage') || data.classification === 'crisis' ? 'text-rose-500' : 
                'text-emerald-500'
              ) :
              (data.bmi_classification === 'normal' ? 'text-emerald-500' : 'text-amber-500')
            }`}>
              {isBS ? data.indicator : isBP ? data.classification : data.bmi_classification}
            </span>
          </div>
        </div>
      </div>
      
      {expanded && (
        <div 
          className="px-5 pb-5 pt-0 flex flex-col gap-4 border-t border-foreground/5 animate-in fade-in slide-in-from-top-1 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-2 gap-4 mt-4">
            {isBS && (
              <>
                <div className="flex flex-col gap-1">
                  <p className="text-[9px] font-mono font-bold text-foreground/30 uppercase">Measurement</p>
                  <p className="text-xs font-semibold text-foreground/70 uppercase">{data.measurement_type?.replace('_', ' ')}</p>
                </div>
                {data.meal_info && (
                  <div className="flex flex-col gap-1">
                    <p className="text-[9px] font-mono font-bold text-foreground/30 uppercase">Meal Context</p>
                    <p className="text-xs text-foreground/70">{data.meal_info}</p>
                  </div>
                )}
                {data.medication_info && (
                  <div className="flex flex-col gap-1 col-span-2">
                    <p className="text-[9px] font-mono font-bold text-foreground/30 uppercase">Medication</p>
                    <p className="text-xs text-foreground/70">{data.medication_info}</p>
                  </div>
                )}
              </>
            )}
            
            {isBP && (
              <>
                <div className="flex flex-col gap-1">
                  <p className="text-[9px] font-mono font-bold text-foreground/30 uppercase">Pulse</p>
                  <p className="text-xs font-semibold text-foreground/70">{data.pulse} BPM</p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-[9px] font-mono font-bold text-foreground/30 uppercase">Posture</p>
                  <p className="text-xs font-semibold text-foreground/70 uppercase">{data.posture}</p>
                </div>
              </>
            )}
            
            {isW && (
              <>
                <div className="flex flex-col gap-1">
                  <p className="text-[9px] font-mono font-bold text-foreground/30 uppercase">BMI</p>
                  <p className="text-xs font-semibold text-foreground/70">{data.bmi?.toFixed(1)}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-[9px] font-mono font-bold text-foreground/30 uppercase">Body Fat</p>
                  <p className="text-xs font-semibold text-foreground/70">{data.body_fat}%</p>
                </div>
              </>
            )}
          </div>
          
          {data.notes && (
            <div className="squircle bg-foreground/5 p-3 mt-1">
              <p className="text-[9px] font-mono font-bold text-foreground/30 uppercase mb-1">Notes</p>
              <p className="text-xs text-foreground/70 leading-relaxed italic">&quot;{data.notes}&quot;</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Documents() {
  const [activeTab, setActiveTab] = useState<Tab>("add");
  const [inputMethod, setInputMethod] = useState<InputMethod>("file");
  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [manualMode, setManualMode] = useState<ManualMode>("lab");
  const [vitals, setVitals] = useState<{ bs: any[], bp: any[], weight: any[] }>({ bs: [], bp: [], weight: [] });
  const [loading, setLoading] = useState(true);

  const [formValues, setFormValues] = useState({ ...EMPTY_RECORD });
  const [dynamicParams, setDynamicParams] = useState<DynamicParam[]>([]);
  const [autofilled, setAutofilled] = useState<Set<string>>(new Set());

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ocrState, setOcrState] = useState<OcrState>("idle");
  const [isDragging, setIsDragging] = useState(false);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [editValues, setEditValues] = useState({ ...EMPTY_RECORD });

  const [toast, setToast] = useState<{ msg: string; warn: boolean } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string, warn = false) => {
    setToast({ msg, warn });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const fetchVitals = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) return;
    try {
      const [bs, bp, w] = await Promise.all([
        getBloodSugarLogs(token),
        getBloodPressureLogs(token),
        getWeightLogs(token)
      ]);
      setVitals({ bs, bp, weight: w });
    } catch (error) {
      console.error("Failed to fetch vitals:", error);
    }
  }, []);

  const fetchRecords = useCallback(async () => {
    try {
        const token = localStorage.getItem("access_token");
        if (!token) return;

        const resp = await getDocuments(token);

        console.log("[documents] raw API response:", JSON.stringify(resp, null, 2));

        if (resp.rag_error) {
          console.warn("[documents] RAG service error:", resp.rag_error);
        }

        const dataList: any[] = resp.results || resp.documents || [];
        console.log("[documents] row count:", dataList.length);

        const fetchedRecords: HealthRecord[] = dataList.map((d: any) => {
          const sd: any = d.structured_data || {};
          
          const metrics: any = sd.metrics || sd.parameters || d.metrics || d.parameters || {};

          console.log("[documents] row", d.document_id, "→ sd:", JSON.stringify(sd));

          const getMetricVal = (key: string): string => {
            let v = metrics[key];
            
            if ((v === undefined || v === null) && sd.parameters) {
                const paramKey = Object.keys(sd.parameters).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, "_").includes(key));
                if (paramKey) v = sd.parameters[paramKey];
            }

            if (v === undefined || v === null) return "";
            if (typeof v === "object" && v !== null && "value" in v) return String(v.value);
            return String(v);
          };

          return {
            id: d.document_id || d.id || String(Math.random()),
            createdAt: new Date(d.confirmed_at || d.uploaded_at || d.created_at || new Date()),

            // report_date is the canonical key; fall back to legacy "date" just in case
            reportDate: sd.report_date || sd.date || d.report_date || d.date || "",
            lab:        sd.lab_name   || sd.lab   || d.lab_name   || d.lab   || "",

            glucoseFasting:  getMetricVal("glucose_fasting"),
            glucosePostmeal: getMetricVal("glucose_postmeal"),
            hba1c:           getMetricVal("hba1c"),

            cholTotal:       getMetricVal("chol_total"),
            cholLDL:         getMetricVal("chol_ldl"),
            cholHDL:         getMetricVal("chol_hdl"),
            triglycerides:   getMetricVal("triglycerides"),

            hemoglobin:      getMetricVal("hemoglobin"),
            hematocrit:      getMetricVal("hematocrit"),
            wbc:             getMetricVal("wbc"),
            platelets:       getMetricVal("platelets"),

            uricAcid:        getMetricVal("uric_acid"),
            creatinine:      getMetricVal("creatinine"),
            bun:             getMetricVal("bun"),

            notes: getMetricVal("notes") || sd.notes || d.notes || "",

            additionalMetrics: (() => {
              const additional: Record<string, string> = {};
              const rawAdditional = metrics.additional_metrics || sd.parameters || {};
              Object.entries(rawAdditional).forEach(([k, v]: [string, any]) => {
                const standardKeys = ["glucose_fasting", "glucose_postmeal", "hba1c", "chol_total", "chol_ldl", "chol_hdl", "triglycerides", "hemoglobin", "hematocrit", "wbc", "platelets", "uric_acid", "creatinine", "bun", "notes"];
                if (standardKeys.includes(k.toLowerCase().replace(/ /g, "_"))) return;

                additional[k] = typeof v === "object" && v !== null && "value" in v
                  ? String(v.value)
                  : String(v ?? "");
              });
              return additional;
            })(),
          };
        });

        console.log("[documents] mapped:", fetchedRecords.map(r => ({ id: r.id, reportDate: r.reportDate, lab: r.lab })));
        setRecords(fetchedRecords);
      } catch (error) {
        console.error("[documents] fetch failed:", error);
      }
    }, [getDocuments]);

  useEffect(() => {
    fetchRecords();
    fetchVitals();
  }, [fetchRecords, fetchVitals]);

  const runOCR = useCallback(async (file: File) => {
    setOcrState("processing");
    try {
      const token = localStorage.getItem("access_token");
      if (!token) throw new Error("Not authenticated");

      const resp = await uploadDocument(token, file, "lab_result");

      if (resp.document_id) setCurrentDocumentId(resp.document_id);

      let extracted: Partial<typeof EMPTY_RECORD> = {};
      let additionalParams: DynamicParam[] = [];

      if (resp.preview) {
        const parsed = mapPreviewToForm(resp.preview);
        extracted = parsed.mapped || {};
        additionalParams = parsed.dynamicFields;
      } else {
        extracted = resp.extracted_data ?? resp.metrics ?? {};
      }

      setFormValues({ ...EMPTY_RECORD, ...extracted });
      setDynamicParams(additionalParams);

      const filledKeys = Object.keys(extracted).filter(k => (extracted as any)[k] !== "");
      setAutofilled(new Set([...filledKeys, ...additionalParams.map(p => p.label)]));

      setOcrState("done");
      showToast("OCR complete — please review the fields");
    } catch (error) {
      console.error(error);
      setOcrState("idle");
      showToast("Failed to run OCR on document", true);
    }
  }, [showToast]);

  const handleFileSelect = (file: File) => {
    const isValid = file.type === "application/pdf" || file.type.startsWith("image/");
    if (!isValid) { showToast("Please upload a PDF or Image file", true); return; }
    if (file.size > 10 * 1024 * 1024) { showToast("File exceeds the 10 MB limit", true); return; }
    setSelectedFile(file);
    runOCR(file);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setOcrState("idle");
    setFormValues({ ...EMPTY_RECORD });
    setDynamicParams([]);
    setAutofilled(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFormChange = (field: keyof typeof EMPTY_RECORD, value: string) => {
    setFormValues(p => ({ ...p, [field]: value }));
    setAutofilled(p => { const n = new Set(p); n.delete(field); return n; });
  };

  const handleDynamicChange = (index: number, value: string) => {
    const newParams = [...dynamicParams];
    newParams[index].value = value;
    setDynamicParams(newParams);
    setAutofilled(p => { const n = new Set(p); n.delete(newParams[index].label); return n; });
  };

  const handleSubmit = async () => {
    if (!formValues.reportDate) {
      showToast("Please fill in the Report Date", true);
      return;
    }

    try {
      const token = localStorage.getItem("access_token");
      if (!token) throw new Error("Not authenticated");

      if (!formValues.reportDate || !formValues.lab) {
        showToast("Please provide report date and lab name", true);
        return;
      }

      const formattedDate = formatDateToYYYYMMDD(formValues.reportDate);

      const dynamicMetrics = dynamicParams.reduce(
        (acc, curr) => ({ ...acc, [curr.label]: curr.value }),
        {}
      );

      const apiPayload = {
        report_date: formattedDate,
        lab_name: formValues.lab,
        metrics: {
          glucose_fasting: formValues.glucoseFasting,
          glucose_postmeal: formValues.glucosePostmeal,
          hba1c: formValues.hba1c,
          chol_total: formValues.cholTotal,
          chol_ldl: formValues.cholLDL,
          chol_hdl: formValues.cholHDL,
          triglycerides: formValues.triglycerides,
          hemoglobin: formValues.hemoglobin,
          hematocrit: formValues.hematocrit,
          wbc: formValues.wbc,
          platelets: formValues.platelets,
          uric_acid: formValues.uricAcid,
          creatinine: formValues.creatinine,
          bun: formValues.bun,
          notes: formValues.notes,
          additional_metrics: dynamicMetrics
        }
      };

      if (inputMethod === "manual") {
        await createManualDocument(token, apiPayload as any);
      } else {
        if (!currentDocumentId) throw new Error("Missing document id");
        await confirmDocument(token, currentDocumentId, apiPayload);
      }
    } catch (error) {
      console.error(error);
      showToast("Failed to save document to server", true);
      return; // Berhenti jika gagal save ke server
    }

    // Jika berhasil save ke server, baru update UI lokal
    const rec: HealthRecord = {
      id: currentDocumentId || Date.now().toString(),
      createdAt: new Date(),
      ...formValues,
      additionalMetrics: dynamicParams.reduce((acc, curr) => ({ ...acc, [curr.label]: curr.value }), {})
    };
    setRecords(p => [rec, ...p]);

    setFormValues({ ...EMPTY_RECORD });
    setDynamicParams([]);
    setAutofilled(new Set());
    setCurrentDocumentId(null);
    clearFile();
    showToast("Health record saved!");
    setActiveTab("records");
  };


  const openEdit = (r: HealthRecord) => {
    setEditValues(r);

    const params: DynamicParam[] = Object.entries(r.additionalMetrics || {}).map(
      ([label, value]) => ({
        label,
        value: String(value),
        unit: ""
      })
    );

    setDynamicParams(params);
    setModal({ type: "edit", record: r });
  };

  const saveEdit = async () => {
    if (modal.type !== "edit") return;

    try {
      const token = localStorage.getItem("access_token");
      if (!token) throw new Error("Not authenticated");

      const formattedDate = formatDateToYYYYMMDD(editValues.reportDate);
      const dynamicMetrics = dynamicParams.reduce(
        (acc, curr) => ({ ...acc, [curr.label]: curr.value }),
        {}
      );

      const apiPayload = {
        report_date: formattedDate,
        lab_name: editValues.lab,
        metrics: {
          glucose_fasting: editValues.glucoseFasting,
          glucose_postmeal: editValues.glucosePostmeal,
          hba1c: editValues.hba1c,
          chol_total: editValues.cholTotal,
          chol_ldl: editValues.cholLDL,
          chol_hdl: editValues.cholHDL,
          triglycerides: editValues.triglycerides,
          hemoglobin: editValues.hemoglobin,
          hematocrit: editValues.hematocrit,
          wbc: editValues.wbc,
          platelets: editValues.platelets,
          uric_acid: editValues.uricAcid,
          creatinine: editValues.creatinine,
          bun: editValues.bun,
          notes: editValues.notes,
          additional_metrics: dynamicMetrics
        }
      };

      await updateDocument(token, modal.record.id, apiPayload);

      const updatedRecord: HealthRecord = {
        ...modal.record,
        ...editValues,
        additionalMetrics: dynamicMetrics
      };

      setRecords(p => p.map(r => r.id === modal.record.id ? updatedRecord : r));
      setModal({ type: "none" });
      setDynamicParams([]);
      showToast("Record updated");
    } catch (error) {
      console.error(error);
      showToast("Failed to save changes", true);
    }
  };

  const confirmDelete = async () => {
    if (modal.type !== "delete") return;

    try {
      const token = localStorage.getItem("access_token");
      if (token && modal.id && !modal.id.startsWith("demo")) {
        await apiDeleteDocument(token, modal.id);
      }
    } catch (error) {
      console.error(error);
      showToast("Failed to delete document from server", true);
    }

    setRecords(p => p.filter(r => r.id !== (modal as any).id));
    setModal({ type: "none" });
    showToast("Record deleted");
  };

  return (
    <div className="flex flex-col items-center min-h-screen bg-gray-300 text-foreground">

      <header className="w-[70%] mt-5 z-10 flex -space-x-2.75 items-center">
        <div className="flex flex-col w-full px-6 py-4 squircle bg-background">
          <h1 className="text-xl font-semibold text-foreground">Health Documents</h1>
          <p className="text-[12px] font-mono text-foreground/50">Manage your health report data</p>
        </div>
      </header>

      <div className="w-[70%] z-10 mt-4 flex gap-2">
        {(["add", "records"] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-5 py-2.5 squircle text-[13px] font-medium font-mono border transition-all duration-200 ${activeTab === tab
              ? "bg-richcerulean text-background border-richcerulean"
              : "bg-background text-foreground/60 border-foreground/15 hover:border-richcerulean hover:text-richcerulean"
              }`}
          >
            {tab === "add" ? <FileUp size={14} /> : <ClipboardList size={14} />}
            {tab === "add" ? "Upload / Add" : `My Records (${records.length})`}
          </button>
        ))}
      </div>

      <main className="relative w-[70%] z-10 mt-4 mb-16 flex flex-col gap-4">

        {activeTab === "add" && (
          <div className="squircle bg-background p-8 flex flex-col gap-5" style={{ animation: "fadeUp 0.25s ease-out" }}>

            <div className="flex gap-2">
              {(["file", "manual"] as InputMethod[]).map(m => (
                <button
                  key={m}
                  onClick={() => { setInputMethod(m); if (m === "manual") clearFile(); }}
                  className={`flex items-center gap-2 px-4 py-2 squircle text-[13px] font-mono font-medium border transition-all duration-150 ${inputMethod === m
                    ? "bg-richcerulean/10 text-richcerulean border-richcerulean/40"
                    : "text-foreground/50 border-foreground/15 hover:border-foreground/30 hover:text-foreground/70"
                    }`}
                >
                  {m === "file" ? <ImageIcon size={14} /> : <PenLine size={14} />}
                  {m === "file" ? "Upload PDF / Photo" : "Manual Entry"}
                </button>
              ))}
            </div>

            {inputMethod === "file" && (
              <div className="flex flex-col gap-3">
                {!selectedFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={e => {
                      e.preventDefault();
                      setIsDragging(false);
                      const f = e.dataTransfer.files[0];
                      if (f) handleFileSelect(f);
                    }}
                    className={`border-2 border-dashed rounded-[40px] p-12 flex flex-col items-center gap-3 cursor-pointer text-center transition-all duration-200 ${isDragging
                      ? "border-richcerulean bg-richcerulean/10"
                      : "border-foreground/20 bg-richcerulean/5 hover:border-richcerulean hover:bg-richcerulean/10"
                      }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf, image/jpeg, image/png, image/jpg"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                    />
                    <FileUp size={38} className="text-richcerulean/50" />
                    <div>
                      <p className="font-semibold text-sm text-foreground">
                        Drop your PDF or Photo here
                      </p>
                      <p className="text-[12px] font-mono text-foreground/40 mt-1">
                        or click to browse · max 10 MB
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="squircle border border-foreground/15 bg-background p-4 flex items-center gap-3">
                    <div className="w-10 h-10 squircle bg-richcerulean/10 flex items-center justify-center shrink-0">
                      {selectedFile.type.startsWith("image/") ? (
                        <ImageIcon size={18} className="text-richcerulean" />
                      ) : (
                        <FileText size={18} className="text-richcerulean" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                      <p className="text-[11px] font-mono text-foreground/40 mt-0.5">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      {ocrState === "processing" && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1 rounded-full bg-foreground/10 overflow-hidden">
                            <div
                              className="h-full bg-richcerulean rounded-full"
                              style={{ animation: "grow 2s ease-out forwards" }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-foreground/40 flex items-center gap-1">
                            <Loader2 size={10} className="animate-spin" /> reading…
                          </span>
                        </div>
                      )}
                      {ocrState === "done" && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <CheckCircle size={11} className="text-green-500" />
                          <span className="text-[11px] font-mono text-green-600">
                            OCR complete — review fields below
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={clearFile}
                      className="w-7 h-7 rounded-full border border-foreground/15 flex items-center justify-center text-foreground/40 hover:text-foreground/70 hover:border-foreground/40 transition-all shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}

                {ocrState === "done" && (
                  <div
                    className="flex items-center gap-2.5 squircle border border-amber-300/60 bg-amber-50 px-4 py-3"
                    style={{ animation: "fadeUp 0.2s ease-out" }}
                  >
                    <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                    <p className="text-[12px] font-mono text-amber-700">
                      Fields highlighted in green were auto-filled by OCR. Please review and correct any errors before saving.
                    </p>
                  </div>
                )}

                {ocrState === "processing" && (
                  <div className="flex items-center gap-2.5 squircle border border-richcerulean/20 bg-richcerulean/5 px-4 py-3">
                    <Loader2 size={14} className="text-richcerulean animate-spin shrink-0" />
                    <p className="text-[12px] font-mono text-richcerulean">
                      Reading your document with OCR…
                    </p>
                  </div>
                )}
              </div>
            )}

            {(inputMethod === "manual" || selectedFile) && (
              <div style={{ animation: "fadeUp 0.2s ease-out" }} className="flex flex-col gap-6">
                {inputMethod === "manual" && !selectedFile && (
                  <ManualModeSelector active={manualMode} onChange={setManualMode} />
                )}

                {(manualMode === "lab" || selectedFile) ? (
                  <>
                    <HealthForm
                      values={formValues}
                      autofilled={autofilled}
                      dynamicParams={dynamicParams}
                      showEmptyFields={inputMethod === "manual"}
                      onChange={handleFormChange}
                      onDynamicChange={handleDynamicChange}
                    />

                    <div className="mt-4 flex -space-x-2.75 items-center">
                      <div className="flex flex-col w-full squircle bg-foreground/5 px-5 py-3">
                        <p className="text-[11px] font-mono text-foreground/40">
                          Review all fields before saving · Date &amp; Patient Name are required
                        </p>
                      </div>
                      <span className="w-7 h-7 rotate-135 bg-foreground/5 scoop-70-30 -z-1" />
                      <Button
                        bgClass="bg-richcerulean text-background"
                        hoverClass="hover:bg-foreground hover:text-background"
                        onClick={handleSubmit}
                        title="New record"
                      >
                        <FilePlus2 size={20} />
                      </Button>
                    </div>
                  </>
                ) : (
                  <ManualTracker onSave={() => {
                    fetchVitals();
                    fetchRecords();
                    setToast({ msg: "Health log saved successfully!", warn: false });
                    setTimeout(() => setToast(null), 3000);
                    setActiveTab("records");
                  }} />
                )}
              </div>
            )}

            {inputMethod === "file" && !selectedFile && (
              <p className="text-[12px] font-mono text-foreground/30 text-center mt-2">
                Upload a PDF or Photo to auto-fill the form, or switch to Manual Entry.
              </p>
            )}
          </div>
        )}

        {activeTab === "records" && (
          <div style={{ animation: "fadeUp 0.25s ease-out" }}>
            {records.length === 0 && vitals.bs.length === 0 && vitals.bp.length === 0 && vitals.weight.length === 0 ? (
              <div className="squircle bg-background p-16 flex flex-col items-center gap-4 text-center">
                <ClipboardList size={40} className="text-foreground/20" />
                <div>
                  <p className="font-semibold text-foreground/60">No records yet</p>
                  <p className="text-[12px] font-mono text-foreground/40 mt-1">
                    Upload a PDF or enter data manually to get started.
                  </p>
                </div>
                <Button
                  onClick={() => setActiveTab("add")}
                  bgClass="bg-richcerulean text-background"
                  hoverClass="hover:bg-foreground hover:text-background"
                  title="Add record"
                >
                  <FilePlus2 size={20} />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {records.map(r => (
                  <RecordCard
                    key={r.id}
                    record={r}
                    onEdit={openEdit}
                    onDelete={(id, name) => setModal({ type: "delete", id, name })}
                  />
                ))}

                {(vitals.bs.length > 0 || vitals.bp.length > 0 || vitals.weight.length > 0) && (
                  <div className="mt-8 flex flex-col gap-4">
                    <SectionLabel>Health Vitals History</SectionLabel>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {vitals.bp.slice(0, 4).map(v => <VitalsCard key={v.id} type="blood_pressure" data={v} />)}
                      {vitals.bs.slice(0, 4).map(v => <VitalsCard key={v.id} type="blood_sugar" data={v} />)}
                      {vitals.weight.slice(0, 4).map(v => <VitalsCard key={v.id} type="weight" data={v} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {modal.type === "edit" && (
        <>
          <div
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm"
            onClick={() => { setModal({ type: "none" }); setDynamicParams([]); }}
          />
          <div
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-background flex flex-col"
            style={{ animation: "slideIn 0.25s ease-out", boxShadow: "-8px 0 40px rgba(0,0,0,0.12)" }}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/10">
              <div>
                <h2 className="font-semibold text-foreground">Edit Record</h2>
                <p className="text-[11px] font-mono text-foreground/40 mt-0.5">
                  {modal.record.reportDate}
                </p>
              </div>
              <button
                onClick={() => { setModal({ type: "none" }); setDynamicParams([]); }}
                className="w-8 h-8 rounded-full border border-foreground/15 flex items-center justify-center text-foreground/40 hover:border-foreground/40 transition-all"
              >
                <X size={14} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-foreground/10 [&::-webkit-scrollbar-thumb]:rounded-full">
              <HealthForm
                values={editValues}
                autofilled={new Set()}
                dynamicParams={dynamicParams}
                showEmptyFields={false}
                onDynamicChange={(index, val) => {
                  const newParams = [...dynamicParams];
                  newParams[index].value = val;
                  setDynamicParams(newParams);
                }}
                onChange={(f, v) => setEditValues(p => ({ ...p, [f]: v }))}
              />
            </div>

            <div className="border-t border-foreground/10 px-6 py-4 flex -space-x-2.75 items-center">
              <div className="flex flex-col w-full squircle bg-foreground/5 px-5 py-3">
                <p className="text-[11px] font-mono text-foreground/40">Changes are saved locally</p>
              </div>
              <span className="w-7 h-7 rotate-135 bg-foreground/5 scoop-70-30 -z-1" />
              <Button
                onClick={saveEdit}
                bgClass="bg-richcerulean text-background"
                hoverClass="hover:bg-foreground hover:text-background"
                title="Save changes"
              >
                <CheckCircle size={20} />
              </Button>
            </div>
          </div>
        </>
      )}

      {modal.type === "delete" && (
        <>
          <div
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm"
            onClick={() => setModal({ type: "none" })}
          />
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ animation: "fadeUp 0.2s ease-out" }}
          >
            <div className="squircle bg-background p-8 w-full max-w-sm flex flex-col items-center text-center gap-4">
              <div className="w-14 h-14 squircle bg-red-50 border border-red-200 flex items-center justify-center">
                <Trash2 size={22} className="text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Delete this record?</h3>
                <p className="text-[12px] font-mono text-foreground/50 mt-1">{modal.name}</p>
                <p className="text-sm text-foreground/60 mt-2 leading-relaxed">
                  This action cannot be undone. The health data will be permanently removed.
                </p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setModal({ type: "none" })}
                  className="flex-1 py-3 squircle border border-foreground/20 text-sm font-medium text-foreground/60 hover:border-foreground/40 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 py-3 squircle bg-red-500 text-white text-sm font-medium hover:bg-red-600 transition-all"
                >
                  Yes, Delete
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-100 pointer-events-none flex items-center gap-2 px-5 py-2.5 squircle font-mono text-[12px] font-medium ${toast.warn ? "bg-amber-500 text-white" : "bg-foreground text-background"
            }`}
          style={{ animation: "fadeUp 0.3s ease-out" }}
        >
          {toast.warn ? <AlertTriangle size={13} /> : <CheckCircle size={13} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}