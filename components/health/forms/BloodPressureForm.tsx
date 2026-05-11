import React, { useState } from 'react';
import { FormInput } from '../shared/FormInput';
import { Save, Activity } from 'lucide-react';
import { createBloodPressureLog } from '../../../lib/api';

interface BloodPressureFormProps {
  onSave?: () => void;
  onCancel?: () => void;
}

export const BloodPressureForm: React.FC<BloodPressureFormProps> = ({ onSave, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [values, setValues] = useState({
    recordedAt: new Date().toISOString().slice(0, 16),
    systolic: '',
    diastolic: '',
    pulse: '',
    posture: 'sitting',
    notes: ''
  });

  const getClassification = (sys: number, dia: number) => {
    if (!sys || !dia) return null;
    if (sys >= 180 || dia >= 120) return { label: 'CRISIS', color: 'bg-red-600' };
    if (sys >= 160 || dia >= 100) return { label: 'STAGE 2', color: 'bg-rose-500' };
    if (sys >= 140 || dia >= 90) return { label: 'STAGE 1', color: 'bg-amber-500' };
    if (sys >= 120 || dia > 80) return { label: 'PRE-HTN', color: 'bg-yellow-500' };
    if (sys < 90 || dia < 60) return { label: 'LOW', color: 'bg-blue-500' };
    return { label: 'NORMAL', color: 'bg-emerald-500' };
  };

  const classification = getClassification(Number(values.systolic), Number(values.diastolic));

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      if (!token) return;

      await createBloodPressureLog(token, {
        recorded_at: new Date(values.recordedAt).toISOString(),
        systolic: Number(values.systolic),
        diastolic: Number(values.diastolic),
        pulse: Number(values.pulse),
        posture: values.posture,
        notes: values.notes
      });
      
      onSave?.();
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormInput
          label="Date & Time"
          type="datetime-local"
          value={values.recordedAt}
          onChange={(v) => setValues({ ...values, recordedAt: v })}
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-[11px] font-mono font-semibold text-foreground/50 uppercase tracking-wider px-1">
            Status
          </label>
          <div className="flex items-center h-11.5 px-4 bg-foreground/3 border border-foreground/10 squircle">
             {classification ? (
               <div className="flex items-center gap-2">
                 <div className={`w-2 h-2 rounded-full ${classification.color} animate-pulse`} />
                 <span className="text-xs font-bold text-foreground/70 uppercase">{classification.label}</span>
               </div>
             ) : (
               <span className="text-xs font-mono text-foreground/20">Enter pressure values...</span>
             )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <FormInput
          label="Systolic"
          type="number"
          value={values.systolic}
          onChange={(v) => setValues({ ...values, systolic: v })}
          placeholder="Top"
          unit="mmHg"
        />
        <FormInput
          label="Diastolic"
          type="number"
          value={values.diastolic}
          onChange={(v) => setValues({ ...values, diastolic: v })}
          placeholder="Bottom"
          unit="mmHg"
        />
        <FormInput
          label="Pulse"
          type="number"
          value={values.pulse}
          onChange={(v) => setValues({ ...values, pulse: v })}
          placeholder="BPM"
          unit="BPM"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-mono font-semibold text-foreground/50 uppercase tracking-wider px-1">
          Body Posture
        </label>
        <div className="flex gap-2">
          {['sitting', 'standing', 'lying'].map((p) => (
            <button
              key={p}
              onClick={() => setValues({ ...values, posture: p })}
              className={`flex-1 px-3 py-2 text-[11px] font-mono font-bold uppercase squircle border transition-all ${
                values.posture === p
                  ? 'bg-richcerulean text-background border-richcerulean'
                  : 'bg-background text-foreground/40 border-foreground/10 hover:border-foreground/30'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <FormInput
        label="Notes"
        value={values.notes}
        onChange={(v) => setValues({ ...values, notes: v })}
        placeholder="Any physical symptoms?"
      />

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSubmit}
          disabled={loading || !values.systolic || !values.diastolic}
          className="flex-1 flex items-center justify-center gap-2 bg-richcerulean text-background py-3 squircle font-bold text-sm hover:bg-foreground transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          {loading ? 'Saving...' : <><Save size={18} /> Save Log</>}
        </button>
        <button
          onClick={onCancel}
          className="px-6 py-3 squircle border border-foreground/10 text-foreground/40 font-bold text-sm hover:border-foreground/30 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
