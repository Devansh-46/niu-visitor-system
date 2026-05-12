'use client';
import { useState } from 'react';
import { AppConfig } from '@/types';
import { toast } from './Toast';
import emailjs from '@emailjs/browser';

interface Props {
  config: AppConfig;
  onSave: (cfg: AppConfig) => void;
}

export function SettingsPage({ config, onSave }: Props) {
  const [form, setForm] = useState<AppConfig>(config);

  function update<K extends keyof AppConfig>(key: K, value: AppConfig[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function save() {
    onSave(form);
    if (form.emailjsKey) {
      try { emailjs.init({ publicKey: form.emailjsKey }); } catch {}
    }
    toast('✓ Configuration saved');
  }

  async function testEmail() {
    if (!form.emailjsKey || !form.emailjsService || !form.emailjsTemplate || !form.email) {
      toast('Fill in all EmailJS fields and admissions email first', 'error');
      return;
    }
    toast('Sending test email...');
    try {
      emailjs.init({ publicKey: form.emailjsKey });
      await emailjs.send(form.emailjsService, form.emailjsTemplate, {
        to_email: form.email,
        cc_email: form.cc || '',
        visitor_id: 'TEST-001',
        visitor_name: 'Test Visitor',
        visitor_phone: '+91 9999999999',
        visitor_email: 'test@example.com',
        purpose: 'System Test',
        program: 'N/A',
        meet_with: 'N/A',
        date: new Date().toLocaleDateString('en-IN'),
        time: new Date().toLocaleTimeString('en-IN'),
        notes: 'This is a test email from NIU Visitor System',
        today_count: '0',
        operator: form.operator || 'Front Desk',
      });
      toast('✓ Test email sent! Check inbox');
    } catch (err) {
      const e = err as { text?: string; message?: string };
      toast('Email failed: ' + (e.text || e.message || 'check console'), 'error');
      console.error(err);
    }
  }

  async function testSheets() {
    if (!form.sheetsURL) {
      toast('Enter Google Apps Script URL first', 'error');
      return;
    }
    toast('Testing connection...');
    try {
      await fetch(form.sheetsURL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          visitor: {
            id: 'TEST-' + Date.now(),
            date: new Date().toLocaleDateString('en-IN'),
            time: new Date().toLocaleTimeString('en-IN'),
            name: 'TEST CONNECTION',
            phone: '0000000000',
            email: 'test@niu.test',
            purpose: 'Connection Test',
            program: '', meetWith: '',
            notes: 'Delete this row if successful',
            operator: 'System Test',
          },
        }),
      });
      toast('✓ Test sent! Check your Google Sheet for a TEST row');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast('Test failed: ' + msg, 'error');
    }
  }

  function showAppsScript() {
    const code = `function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = JSON.parse(e.postData.contents);

  if (data.action === 'add' && data.visitor) {
    const v = data.visitor;
    sheet.appendRow([
      v.id, v.date, v.time, v.name, v.phone, v.email,
      v.purpose, v.program, v.meetWith, v.notes, v.photoUrl || '', v.operator
    ]);
  } else if (data.action === 'bulk' && data.visitors) {
    const rows = data.visitors.map(v => [
      v.id, v.date, v.time, v.name, v.phone, v.email,
      v.purpose, v.program, v.meetWith, v.notes, v.photoUrl || '', v.operator
    ]);
    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 12).setValues(rows);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

    const win = window.open('', '_blank', 'width=700,height=600');
    if (!win) return;
    win.document.write(`
      <html><head><title>NIU - Google Apps Script</title>
      <style>
        body { font-family: monospace; padding: 20px; background: #0a2540; color: #f4d774; }
        h2 { color: #d4a017; }
        pre { background: white; color: #0a0e1a; padding: 16px; border-radius: 6px; overflow: auto; }
        button { background: #d4a017; color: #0a2540; border: 0; padding: 8px 16px; cursor: pointer; font-weight: 600; border-radius: 4px; margin-bottom: 12px; }
      </style></head><body>
      <h2>Google Apps Script — Paste this into your sheet's Apps Script editor</h2>
      <button onclick="navigator.clipboard.writeText(document.getElementById('code').innerText).then(()=>this.textContent='Copied!')">📋 Copy Code</button>
      <pre id="code">${code.replace(/</g, '&lt;')}</pre>
      </body></html>
    `);
  }

  return (
    <div>
      <h2 className="font-serif text-[32px] font-semibold text-niu-navy mb-1.5 -tracking-[0.5px]">
        Settings & Integration Setup
      </h2>
      <p className="text-muted text-sm mb-7">
        Configure Google Sheets sync and email destination for the admissions department.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Config card */}
        <div className="bg-white border border-line rounded-lg p-7">
          <h3 className="font-serif text-lg font-semibold mb-1 text-niu-navy">Configuration</h3>
          <p className="text-xs text-muted mb-5 font-mono tracking-[0.5px] uppercase">
            Saved locally in your browser
          </p>

          <Field label="Admissions Dept. Email" required>
            <input type="email" value={form.email}
              onChange={(e) => update('email', e.target.value)}
              placeholder="admissions@niu.edu.in" className={inputCls} />
          </Field>

          <Field label="CC Emails (comma separated)">
            <input type="text" value={form.cc}
              onChange={(e) => update('cc', e.target.value)}
              placeholder="director@niu.edu.in, frontdesk@niu.edu.in" className={inputCls} />
          </Field>

          <Field label="Google Apps Script Web App URL">
            <input type="url" value={form.sheetsURL}
              onChange={(e) => update('sheetsURL', e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec" className={inputCls} />
          </Field>

          <Field label="Receptionist / Operator Name">
            <input type="text" value={form.operator}
              onChange={(e) => update('operator', e.target.value)}
              placeholder="Front Desk" className={inputCls} />
          </Field>

          <div className="border-t border-line pt-4 mt-4">
            <h4 className="font-serif text-sm text-niu-navy mb-1">EmailJS — Auto-send emails</h4>
            <p className="text-[11px] text-muted mb-3.5">
              Sends email automatically without opening mail client
            </p>

            <Field label="EmailJS Public Key">
              <input type="text" value={form.emailjsKey}
                onChange={(e) => update('emailjsKey', e.target.value)}
                placeholder="aBcDeFgHiJ123..." className={inputCls} />
            </Field>

            <Field label="EmailJS Service ID">
              <input type="text" value={form.emailjsService}
                onChange={(e) => update('emailjsService', e.target.value)}
                placeholder="service_abc1234" className={inputCls} />
            </Field>

            <Field label="EmailJS Template ID">
              <input type="text" value={form.emailjsTemplate}
                onChange={(e) => update('emailjsTemplate', e.target.value)}
                placeholder="template_xyz5678" className={inputCls} />
            </Field>

            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input type="checkbox" checked={form.autoEmail}
                onChange={(e) => update('autoEmail', e.target.checked)} />
              <span className="text-sm">Auto-send email on every new visitor</span>
            </label>

            <button onClick={testEmail}
              className="px-[18px] py-[11px] rounded-md text-sm font-medium bg-transparent text-niu-navy border border-line hover:bg-paper-warm mb-3">
              ✉️ Send Test Email
            </button>
          </div>

          <div className="flex gap-2 mt-2">
            <button onClick={save}
              className="px-[18px] py-[11px] rounded-md text-sm font-medium bg-niu-navy text-white hover:bg-niu-deep">
              💾 Save Configuration
            </button>
            <button onClick={testSheets}
              className="px-[18px] py-[11px] rounded-md text-sm font-medium bg-transparent text-niu-navy border border-line hover:bg-paper-warm">
              🔗 Test Sheets Connection
            </button>
          </div>
        </div>

        {/* Setup card */}
        <div className="bg-white border border-line rounded-lg p-7">
          <h3 className="font-serif text-lg font-semibold mb-1 text-niu-navy">Google Sheets Setup</h3>
          <p className="text-xs text-muted mb-5 font-mono tracking-[0.5px] uppercase">
            Connect to a shared admissions sheet
          </p>

          <Step num={1}>
            Open a new <strong>Google Sheet</strong> and name it <Code>NIU Visitor Log</Code>.
            Add headers in row 1:{' '}
            <Code>ID, Date, Time, Name, Phone, Email, Purpose, Program, Meeting, Notes, Photo URL, Operator</Code>
          </Step>
          <Step num={2}>
            Click <strong>Extensions → Apps Script</strong>. Paste the script (shown below) and save.
          </Step>
          <Step num={3}>
            Click <strong>Deploy → New Deployment → Web App</strong>. Set access to{' '}
            <Code>Anyone</Code>. Copy the URL and paste it into the configuration on the left.
          </Step>
          <Step num={4}>
            Share the sheet with the admissions team. Test the connection using the{' '}
            <strong>Sync to Google Sheets</strong> button.
          </Step>

          <button onClick={showAppsScript}
            className="px-[18px] py-[11px] rounded-md text-sm font-medium bg-transparent text-niu-navy border border-line hover:bg-paper-warm mt-3">
            📄 View Apps Script Code
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  'w-full px-3.5 py-2.5 border border-line rounded-md text-sm bg-paper text-ink transition-all';

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col mb-4">
      <label className="text-xs font-medium text-niu-navy mb-1.5 tracking-[0.3px]">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

function Step({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mb-3.5 items-start">
      <div className="w-6 h-6 bg-niu-gold text-niu-navy rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 font-mono">
        {num}
      </div>
      <div className="text-[13px] text-ink leading-relaxed">{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-paper-warm px-1.5 py-0.5 rounded font-mono text-xs text-niu-navy">
      {children}
    </code>
  );
}
