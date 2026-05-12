'use client';
import { useState } from 'react';
import { Visitor, VisitorPurpose, AppConfig } from '@/types';
import { PhotoCapture } from './PhotoCapture';
import { toast } from './Toast';
import { uploadPhoto } from '@/lib/upload';
import { nextSerial, generateVisitorId } from '@/lib/storage';

const PURPOSES: VisitorPurpose[] = ['Admission Enquiry - New', 'Admission Enquiry - Existing'];

const PROGRAMS = [
  'B.Tech', 'M.Tech', 'MBA', 'BBA', 'B.Sc', 'BA / B.Com',
  'Law (BA LL.B / LL.M)', 'Pharmacy', 'Medical / Paramedical', 'PhD', 'Other',
];

interface Props {
  visitors: Visitor[];
  config: AppConfig;
  onRegistered: (v: Visitor) => void;
  onExport: () => void;
  onSyncSheets: () => void;
  onEmailAdmissions: () => void;
}

interface FormState {
  name: string;
  phone: string;
  email: string;
  purpose: VisitorPurpose | '';
  program: string;
  meetWith: string;
  notes: string;
}

const emptyForm: FormState = {
  name: '', phone: '', email: '', purpose: '', program: '', meetWith: '', notes: '',
};

export function EntryPage({
  visitors, config, onRegistered, onExport, onSyncSheets, onEmailAdmissions,
}: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [photo, setPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const today = new Date().toLocaleDateString('en-IN');
  const todayCount = visitors.filter((v) => v.date === today).length;
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekCount = visitors.filter((v) => new Date(v.timestamp) >= weekAgo).length;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!photo) {
      toast('Please capture or upload a visitor photo', 'error');
      return;
    }
    if (!form.purpose) {
      toast('Please select a purpose', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const now = new Date();
      const serial = nextSerial();
      const id = generateVisitorId(serial, now);

      // Upload photo to Supabase
      let photoUrl = '';
      let photoPath = '';
      try {
        const result = await uploadPhoto(photo, id);
        photoUrl = result.url;
        photoPath = result.path;
      } catch (err) {
        console.error('Photo upload failed:', err);
        toast('Photo upload failed — saved locally only', 'error');
        photoUrl = photo; // fall back to base64
      }

      const visitor: Visitor = {
        id,
        serial,
        timestamp: now.toISOString(),
        date: now.toLocaleDateString('en-IN'),
        time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        purpose: form.purpose as VisitorPurpose,
        program: form.program,
        meetWith: form.meetWith.trim(),
        notes: form.notes.trim(),
        photoUrl,
        photoPath,
        operator: config.operator || 'Front Desk',
        merittoStatus: 'pending',
      };

      onRegistered(visitor);
      setForm(emptyForm);
      setPhoto(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h2 className="font-serif text-[32px] font-semibold text-niu-navy mb-1.5 -tracking-[0.5px]">
        Register a Visitor
      </h2>
      <p className="text-muted text-sm mb-7">
        Capture visitor details, take photo, and generate a printable receipt instantly.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-7">
        {/* Form */}
        <div className="bg-white border border-line rounded-lg p-7 shadow-sm">
          <h3 className="font-serif text-lg font-semibold mb-1 text-niu-navy">Visitor Information</h3>
          <p className="text-xs text-muted mb-5 font-mono tracking-[0.5px] uppercase">
            All fields marked with * are required
          </p>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Field label="Full Name" required>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => update('name', e.target.value)}
                  placeholder="As per ID proof"
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="Phone Number" required>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="+91 98XXXXXXXX"
                  pattern="[0-9+\s\-]{10,15}"
                  required
                  className={inputCls}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Field label="Email Address" required>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  placeholder="visitor@email.com"
                  required
                  className={inputCls}
                />
              </Field>
              <Field label="Purpose of Visit" required>
                <select
                  value={form.purpose}
                  onChange={(e) => update('purpose', e.target.value as VisitorPurpose)}
                  required
                  className={inputCls}
                >
                  <option value="">-- Select Purpose --</option>
                  {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <Field label="Program of Interest">
                <select
                  value={form.program}
                  onChange={(e) => update('program', e.target.value)}
                  className={inputCls}
                >
                  <option value="">-- Optional --</option>
                  {PROGRAMS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Person to Meet / Department">
                <input
                  type="text"
                  value={form.meetWith}
                  onChange={(e) => update('meetWith', e.target.value)}
                  placeholder="e.g. Admissions Office"
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label="Address / Additional Notes">
              <textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                placeholder="City, state, or any other details..."
                className={`${inputCls} min-h-[64px] resize-y`}
              />
            </Field>

            <div className="mt-4">
              <PhotoCapture photo={photo} onChange={setPhoto} />
            </div>

            <div className="flex gap-3 mt-5 pt-5 border-t border-line-soft">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3.5 rounded-md text-[15px] font-medium bg-niu-navy text-white hover:bg-niu-deep hover:-translate-y-px hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-wait"
              >
                {submitting ? 'Processing…' : '✓ Register & Generate Receipt'}
              </button>
              <button
                type="button"
                onClick={() => { setForm(emptyForm); setPhoto(null); }}
                className="px-6 py-3.5 rounded-md text-[15px] font-medium bg-transparent text-niu-navy border border-line hover:bg-paper-warm"
              >
                Clear Form
              </button>
            </div>
          </form>
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col gap-5">
          <div className="bg-gradient-to-br from-niu-navy to-niu-deep text-white p-6 rounded-lg relative overflow-hidden">
            <div className="absolute -top-[30px] -right-[30px] w-[120px] h-[120px] bg-niu-gold opacity-10 rounded-full" />
            <div className="text-[11px] uppercase tracking-[2px] opacity-70 mb-1.5 font-mono">
              Today&apos;s Visitors
            </div>
            <div className="font-serif text-[42px] font-semibold leading-none">{todayCount}</div>
            <div className="text-xs mt-2 text-niu-gold-soft font-mono">
              Live count · auto-updates
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="This Week" value={weekCount} />
            <MiniStat label="Total" value={visitors.length} />
          </div>

          <div className="bg-white border border-line rounded-lg p-5">
            <h3 className="font-serif text-[15px] font-semibold text-niu-navy mb-1">Quick Actions</h3>
            <p className="text-xs text-muted mb-3.5 font-mono tracking-[0.5px] uppercase">
              Export & sync
            </p>
            <div className="flex flex-col gap-2">
              <ActionBtn onClick={onExport}>📊 Download Excel</ActionBtn>
              <ActionBtn onClick={onSyncSheets}>☁️ Sync to Google Sheets</ActionBtn>
              <ActionBtn onClick={onEmailAdmissions}>✉️ Email Admissions Dept.</ActionBtn>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

const inputCls =
  'px-3.5 py-2.5 border border-line rounded-md text-sm bg-paper text-ink transition-all';

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <label className="text-xs font-medium text-niu-navy mb-1.5 tracking-[0.3px]">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white p-4 rounded-md border border-line">
      <div className="text-[10px] text-muted uppercase tracking-[1.5px] font-mono">{label}</div>
      <div className="font-serif text-2xl font-semibold text-niu-navy mt-1">{value}</div>
    </div>
  );
}

function ActionBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-[18px] py-[11px] rounded-md text-sm font-medium bg-transparent text-niu-navy border border-line hover:bg-paper-warm hover:border-niu-navy transition-all inline-flex items-center justify-center gap-2"
    >
      {children}
    </button>
  );
}
