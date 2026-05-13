'use client';
import { useState } from 'react';
import { Visitor } from '@/types';

interface Props {
  visitors: Visitor[];
  onReprint: (v: Visitor) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onExport: () => void;
  onSyncSheets: () => void;
}

export function LogPage({ visitors, onReprint, onDelete, onClear, onExport, onSyncSheets }: Props) {
  const [search, setSearch] = useState('');

  const filtered = visitors.filter((v) => {
    const s = search.toLowerCase();
    return !s ||
      v.name.toLowerCase().includes(s) ||
      v.phone.toLowerCase().includes(s) ||
      v.email.toLowerCase().includes(s) ||
      v.purpose.toLowerCase().includes(s) ||
      v.id.toLowerCase().includes(s);
  });

  const handleExport = () => {
    const pwd = window.prompt('Enter password to download Excel:');
    if (pwd === 'admin1536') {
      onExport();
    } else if (pwd !== null) {
      alert('Incorrect password. Export cancelled.');
    }
  };

  return (
    <div>
      <h2 className="font-serif text-[32px] font-semibold text-niu-navy mb-1.5 -tracking-[0.5px]">
        Visitor Log
      </h2>
      <p className="text-muted text-sm mb-7">
        All registered visitors. Data persists locally and can be exported anytime.
      </p>

      <div className="flex justify-between items-center mb-5 gap-4 flex-wrap">
        <div className="flex-1 min-w-[240px] max-w-[400px] relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, email, or purpose..."
            className="w-full px-3.5 py-2.5 pl-9 border border-line rounded-md text-sm bg-paper"
          />
        </div>
        <div className="flex gap-2">
          <Btn variant="gold" onClick={handleExport}>📊 Export Excel</Btn>
          <Btn variant="outline" onClick={onSyncSheets}>☁️ Sync to Sheets</Btn>
          <Btn variant="danger" onClick={onClear}>🗑 Clear Log</Btn>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-line rounded-lg p-7">
          <div className="text-center py-14 text-muted">
            <div className="text-5xl mb-3 opacity-40">📋</div>
            <div>
              {visitors.length === 0 ? 'No visitors registered yet' : 'No visitors match your search'}
            </div>
          </div>
        </div>
      ) : (
        <table className="w-full bg-white border border-line rounded-lg border-collapse overflow-hidden">
          <thead>
            <tr>
              <Th />
              <Th>ID</Th>
              <Th>Name</Th>
              <Th>Contact</Th>
              <Th>Purpose</Th>
              <Th>CRM</Th>
              <Th>Date / Time</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.id} className="hover:bg-paper">
                <Td>
                  {v.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={v.photoUrl}
                      alt={v.name}
                      className="w-9 h-9 rounded-full object-cover border-2 border-niu-gold"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-niu-navy text-white flex items-center justify-center font-semibold text-[13px]">
                      {v.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </Td>
                <Td>
                  <span className="font-mono text-[11px] text-niu-navy font-semibold">{v.id}</span>
                </Td>
                <Td>
                  <strong>{v.name}</strong>
                  {v.program && (
                    <div className="text-[11px] text-muted">{v.program}</div>
                  )}
                </Td>
                <Td>
                  <div className="text-xs">{maskPhone(v.phone)}</div>
                  <div className="text-xs text-muted">{maskEmail(v.email)}</div>
                </Td>
                <Td>
                  <PurposePill purpose={v.purpose} />
                </Td>
                <Td>
                  <CrmPill status={v.merittoStatus} error={v.merittoError} />
                </Td>
                <Td>
                  <div className="font-mono text-xs">{v.date}</div>
                  <div className="font-mono text-xs text-muted">{v.time}</div>
                </Td>
                <Td>
                  <button
                    onClick={() => onReprint(v)}
                    className="px-2.5 py-1.5 text-xs border border-line rounded mr-1 hover:bg-paper-warm"
                  >🖨</button>
                  <button
                    onClick={() => onDelete(v.id)}
                    className="px-2.5 py-1.5 text-xs border border-danger text-danger rounded hover:bg-red-50"
                  >✕</button>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function maskPhone(phone: string) {
  if (!phone || phone.length < 4) return phone;
  return phone.slice(0, 2) + '*'.repeat(phone.length - 4) + phone.slice(-2);
}

function maskEmail(email: string) {
  if (!email || !email.includes('@')) return email;
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name[0]}***@${domain}`;
  return `${name.slice(0, 2)}${'*'.repeat(name.length - 3)}${name.slice(-1)}@${domain}`;
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="bg-paper-warm px-4 py-3 text-left text-[11px] uppercase tracking-[1px] text-muted font-mono border-b border-line">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-3.5 border-b border-line-soft text-[13px] align-middle">
      {children}
    </td>
  );
}

function PurposePill({ purpose }: { purpose: string }) {
  const isNew = purpose.toLowerCase().includes('new');
  const cls = isNew
    ? 'bg-blue-50 text-blue-700'
    : 'bg-purple-50 text-purple-700';
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-xl text-[11px] font-medium ${cls}`}>
      {purpose}
    </span>
  );
}

function CrmPill({ status, error }: { status?: string; error?: string }) {
  if (!status || status === 'pending') {
    return <span className="text-xs text-muted">…</span>;
  }
  const styles: Record<string, string> = {
    created: 'bg-green-100 text-green-800',
    skipped: 'bg-gray-100 text-gray-600',
    duplicate: 'bg-amber-100 text-amber-800',
    failed: 'bg-red-100 text-red-700 cursor-help',
  };
  return (
    <span
      title={status === 'failed' && error ? error : undefined}
      className={`inline-block px-2.5 py-0.5 rounded-xl text-[11px] font-medium ${styles[status] || ''}`}
    >
      {status}
    </span>
  );
}

function Btn({
  variant, onClick, children,
}: { variant: 'gold' | 'outline' | 'danger'; onClick: () => void; children: React.ReactNode }) {
  const base = 'px-[18px] py-[11px] rounded-md text-sm font-medium cursor-pointer transition-all inline-flex items-center gap-2';
  const styles = {
    gold: 'bg-niu-gold text-niu-navy font-semibold hover:bg-niu-gold-soft',
    outline: 'bg-transparent text-niu-navy border border-line hover:bg-paper-warm hover:border-niu-navy',
    danger: 'bg-white text-danger border border-danger hover:bg-red-50',
  };
  return <button onClick={onClick} className={`${base} ${styles[variant]}`}>{children}</button>;
}