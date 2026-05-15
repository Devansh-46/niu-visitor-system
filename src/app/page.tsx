'use client';
import { useEffect, useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import emailjs from '@emailjs/browser';

import { Header } from '@/components/Header';
import { Tabs, type Tab } from '@/components/Tabs';
import { EntryPage } from '@/components/EntryPage';
import { LogPage } from '@/components/LogPage';
import { SettingsPage } from '@/components/SettingsPage';
import { ReceiptModal } from '@/components/ReceiptModal';
import { ToastContainer, toast } from '@/components/Toast';
import { Visitor, AppConfig } from '@/types';
import {
  getVisitors, saveVisitors, getConfig, saveConfig,
} from '@/lib/storage';

export default function Home() {
  const [tab, setTab] = useState<Tab>('entry');
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [config, setConfig] = useState<AppConfig>(getConfig());
  const [receiptVisitor, setReceiptVisitor] = useState<Visitor | null>(null);
  const [mounted, setMounted] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setVisitors(getVisitors());
    setConfig(getConfig());
    setMounted(true);
  }, []);

  // Initialize EmailJS when config loads
  useEffect(() => {
    if (config.emailjsKey) {
      try { emailjs.init({ publicKey: config.emailjsKey }); } catch {}
    }
  }, [config.emailjsKey]);

  const persistVisitors = useCallback((next: Visitor[]) => {
    setVisitors(next);
    saveVisitors(next);
  }, []);

  /**
   * Push to Meritto via our server API route.
   * - Every visitor is pushed via createOrUpdate (API handles deduplication).
   * - Updates the visitor record with CRM status when complete.
   */
  const pushMeritto = useCallback(async (v: Visitor) => {
    try {
      const res = await fetch('/api/meritto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(v),
      });
      const data = await res.json();
      setVisitors((prev) => {
        const next = prev.map((x) =>
          x.id === v.id
            ? {
                ...x,
                merittoStatus: data.status,
                merittoLeadId: data.leadId,
                merittoError: data.error,
              }
            : x,
        );
        saveVisitors(next);
        return next;
      });
      if (data.status === 'created') toast('✓ Lead created in Meritto');
      else if (data.status === 'updated') toast('✓ Lead updated in Meritto');
      else if (data.status === 'failed') toast('Meritto: ' + (data.error || 'failed'), 'error');
    } catch (err) {
      console.error('Meritto push failed:', err);
    }
  }, []);

  /**
   * Sync a single visitor to Google Sheets (fire-and-forget).
   */
  const syncSingle = useCallback(async (v: Visitor) => {
    if (!config.sheetsURL) return;
    try {
      await fetch(config.sheetsURL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', visitor: v }),
      });
    } catch (err) {
      console.warn('Auto-sync failed:', err);
    }
  }, [config.sheetsURL]);

  /**
   * Auto-send email via EmailJS for new visitor.
   */
  const sendVisitorEmail = useCallback(async (v: Visitor) => {
    if (!config.emailjsKey || !config.emailjsService || !config.emailjsTemplate || !config.email) {
      return;
    }
    const today = new Date().toLocaleDateString('en-IN');
    const todayCount = visitors.filter((x) => x.date === today).length;
    try {
      await emailjs.send(config.emailjsService, config.emailjsTemplate, {
        to_email: config.email,
        cc_email: config.cc || '',
        visitor_id: v.id,
        visitor_name: v.name,
        visitor_phone: v.phone,
        visitor_email: v.email,
        purpose: v.purpose,
        program: v.program || 'N/A',
        meet_with: v.meetWith || 'N/A',
        date: v.date,
        time: v.time,
        notes: v.notes || 'None',
        today_count: String(todayCount),
        operator: v.operator,
      });
      toast('✓ Email sent to admissions');
    } catch (err) {
      console.error('Auto-email failed:', err);
    }
  }, [config, visitors]);

  const handleRegistered = useCallback((v: Visitor) => {
    const next = [v, ...visitors];
    persistVisitors(next);
    setReceiptVisitor(v);
    toast('✓ Visitor registered: ' + v.id);

    // Fire-and-forget integrations
    pushMeritto(v);
    syncSingle(v);
    if (config.autoEmail) sendVisitorEmail(v);
  }, [visitors, persistVisitors, pushMeritto, syncSingle, sendVisitorEmail, config.autoEmail]);

  const handleDelete = useCallback((id: string) => {
    if (!confirm('Delete this visitor entry? This cannot be undone.')) return;
    const next = visitors.filter((v) => v.id !== id);
    persistVisitors(next);
    toast('Entry deleted');
  }, [visitors, persistVisitors]);

  const handleClear = useCallback(() => {
    if (!confirm('Clear ALL visitor data? This cannot be undone. Make sure you have exported a backup first.')) return;
    persistVisitors([]);
    toast('Log cleared');
  }, [persistVisitors]);

  const handleExport = useCallback(() => {
    if (visitors.length === 0) { toast('No data to export', 'error'); return; }
    const rows = visitors.map((v) => ({
      'ID': v.id, 'Date': v.date, 'Time': v.time, 'Name': v.name,
      'Phone': v.phone, 'Email': v.email, 'Purpose': v.purpose,
      'Program': v.program || '', 'Meeting With': v.meetWith || '',
      'Notes': v.notes || '', 'Photo URL': v.photoUrl || '',
      'Operator': v.operator || '',
      'Meritto Status': v.merittoStatus || '',
      'Meritto Lead ID': v.merittoLeadId || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 25 }, { wch: 15 },
      { wch: 28 }, { wch: 22 }, { wch: 15 }, { wch: 22 }, { wch: 30 },
      { wch: 40 }, { wch: 15 }, { wch: 12 }, { wch: 15 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Visitor Log');
    const fileName = `NIU_Visitor_Log_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast('✓ Excel exported: ' + fileName);
  }, [visitors]);

  const handleSyncSheets = useCallback(async () => {
    if (!config.sheetsURL) {
      toast('Configure Google Sheets URL in Settings first', 'error');
      setTab('settings');
      return;
    }
    if (visitors.length === 0) { toast('No data to sync', 'error'); return; }
    toast('Syncing to Google Sheets...');
    try {
      await fetch(config.sheetsURL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk', visitors }),
      });
      toast('✓ Synced to Google Sheets');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast('Sync failed: ' + msg, 'error');
    }
  }, [config.sheetsURL, visitors]);

  const handleEmailAdmissions = useCallback(async () => {
    if (!config.email) {
      toast('Set admissions email in Settings first', 'error');
      setTab('settings');
      return;
    }
    if (visitors.length === 0) { toast('No visitors to email', 'error'); return; }

    const today = new Date().toLocaleDateString('en-IN');
    const todayVisitors = visitors.filter((v) => v.date === today);

    if (config.emailjsKey && config.emailjsService && config.emailjsTemplate) {
      toast('Sending email...');
      let summary = `Daily Visitor Summary for ${today}\n\nTotal Visitors: ${todayVisitors.length}\n\n`;
      todayVisitors.forEach((v, i) => {
        summary += `${i + 1}. ${v.name} (${v.id})\n   Phone: ${v.phone} | Email: ${v.email}\n   Purpose: ${v.purpose} | Time: ${v.time}\n\n`;
      });
      try {
        await emailjs.send(config.emailjsService, config.emailjsTemplate, {
          to_email: config.email, cc_email: config.cc || '',
          visitor_id: 'DAILY-SUMMARY',
          visitor_name: `${todayVisitors.length} visitors today`,
          visitor_phone: '-', visitor_email: '-',
          purpose: 'Daily Summary Report', program: '-', meet_with: '-',
          date: today, time: new Date().toLocaleTimeString('en-IN'),
          notes: summary, today_count: String(todayVisitors.length),
          operator: config.operator || 'Front Desk',
        });
        toast('✓ Email sent to admissions');
        handleExport();
      } catch (err) {
        const e = err as { text?: string; message?: string };
        toast('Email failed: ' + (e.text || e.message), 'error');
      }
      return;
    }

    // Fallback to mailto
    const subject = encodeURIComponent(`NIU Visitor Log — ${today} (${todayVisitors.length} entries)`);
    let body = `Dear Admissions Team,\n\nPlease find today's visitor log below. The full Excel file should be attached separately.\n\n`;
    body += `Date: ${today}\nTotal Visitors Today: ${todayVisitors.length}\n\n--- Visitor Summary ---\n\n`;
    todayVisitors.forEach((v, i) => {
      body += `${i + 1}. ${v.name} (${v.id})\n   Phone: ${v.phone}\n   Email: ${v.email}\n   Purpose: ${v.purpose}\n   Time: ${v.time}\n\n`;
    });
    body += `\nRegards,\n${config.operator || 'Front Desk'}\nNIU Visitor Management System`;
    const cc = config.cc ? '&cc=' + encodeURIComponent(config.cc) : '';
    window.location.href = `mailto:${config.email}?subject=${subject}${cc}&body=${encodeURIComponent(body)}`;
    setTimeout(() => handleExport(), 500);
    toast('Opening email client + downloading Excel');
  }, [config, visitors, handleExport]);

  const handleSaveConfig = useCallback((cfg: AppConfig) => {
    setConfig(cfg);
    saveConfig(cfg);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted">Loading…</div>
    );
  }

  return (
    <>
      <Header />
      <Tabs active={tab} onChange={setTab} />
      <main className="max-w-[1400px] mx-auto px-10 py-8">
        {tab === 'entry' && (
          <EntryPage
            visitors={visitors}
            config={config}
            onRegistered={handleRegistered}
            onExport={handleExport}
            onSyncSheets={handleSyncSheets}
            onEmailAdmissions={handleEmailAdmissions}
          />
        )}
        {tab === 'log' && (
          <LogPage
            visitors={visitors}
            onReprint={setReceiptVisitor}
            onDelete={handleDelete}
            onClear={handleClear}
            onExport={handleExport}
            onSyncSheets={handleSyncSheets}
          />
        )}
        {tab === 'settings' && (
          <SettingsPage config={config} onSave={handleSaveConfig} />
        )}
      </main>
      <ReceiptModal visitor={receiptVisitor} onClose={() => setReceiptVisitor(null)} />
      <ToastContainer />
    </>
  );
}
