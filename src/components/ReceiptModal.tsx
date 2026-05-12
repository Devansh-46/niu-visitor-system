'use client';
import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Visitor } from '@/types';

interface Props {
  visitor: Visitor | null;
  onClose: () => void;
}

export function ReceiptModal({ visitor, onClose }: Props) {
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (visitor && qrRef.current) {
      QRCode.toCanvas(
        qrRef.current,
        JSON.stringify({
          id: visitor.id,
          name: visitor.name,
          phone: visitor.phone,
          date: visitor.date,
        }),
        {
          width: 76,
          margin: 0,
          color: { dark: '#0a2540', light: '#ffffff' },
        },
      );
    }
  }, [visitor]);

  if (!visitor) return null;

  return (
    <div
      className="fixed inset-0 bg-niu-deep/60 z-[1000] flex items-center justify-center p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="receipt-wrap bg-white rounded-lg max-w-[480px] w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="receipt-actions px-6 py-4 border-b border-line flex gap-2 justify-between items-center bg-paper-warm">
          <div className="text-sm text-muted">Receipt Generated</div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="px-[18px] py-[11px] rounded-md text-sm font-semibold bg-niu-gold text-niu-navy hover:bg-niu-gold-soft inline-flex items-center gap-2"
            >
              🖨 Print
            </button>
            <button
              onClick={onClose}
              className="px-[18px] py-[11px] rounded-md text-sm font-medium bg-transparent text-niu-navy border border-line hover:bg-paper-warm"
            >
              Close
            </button>
          </div>
        </div>

        <div className="receipt bg-white font-sans text-ink">
          {/* Header */}
          <div className="bg-niu-navy text-white px-6 py-5 border-b-4 border-niu-gold">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-niu-gold text-niu-navy flex items-center justify-center font-serif font-extrabold text-2xl rounded">
                N
              </div>
              <div>
                <h2 className="font-serif text-xl font-semibold leading-tight">
                  Noida International University
                </h2>
                <p className="font-mono text-[10px] tracking-[1.5px] text-niu-gold-soft uppercase mt-0.5">
                  Visitor Entry Pass
                </p>
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="bg-paper-warm px-6 py-3 border-b border-line flex justify-between items-center">
            <h3 className="font-serif text-sm font-semibold text-niu-navy tracking-[1px] uppercase">
              Visitor Receipt
            </h3>
            <div className="font-mono text-[11px] bg-niu-navy text-white px-2 py-1 rounded tracking-[1px]">
              {visitor.id}
            </div>
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            <Row label="Name" value={visitor.name} />
            <Row label="Phone" value={visitor.phone} />
            <Row label="Email" value={visitor.email} />
            <Row label="Purpose" value={visitor.purpose} />
            {visitor.program && <Row label="Program" value={visitor.program} />}
            {visitor.meetWith && <Row label="Meeting" value={visitor.meetWith} />}
            <Row label="Date" value={visitor.date} />
            <Row label="Time" value={visitor.time} last />
          </div>

          {/* Meta */}
          <div className="grid grid-cols-2 gap-4 px-6 py-4 bg-paper border-t border-b border-line">
            <div className="flex flex-col items-center text-center">
              {visitor.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={visitor.photoUrl}
                  className="w-20 h-20 border-2 border-niu-navy rounded object-cover"
                  alt="Visitor"
                />
              ) : (
                <div className="w-20 h-20 bg-paper-warm border-2 border-dashed border-line rounded flex items-center justify-center text-muted text-[10px]">
                  No photo
                </div>
              )}
              <div className="text-[9px] text-muted uppercase tracking-[1.5px] mt-1.5 font-mono">
                Visitor
              </div>
            </div>
            <div className="flex flex-col items-center text-center">
              <canvas ref={qrRef} className="w-20 h-20 bg-white p-1 border border-line" />
              <div className="text-[9px] text-muted uppercase tracking-[1.5px] mt-1.5 font-mono">
                Verify ID
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 pt-4 pb-5 text-center border-t-[3px] border-double border-niu-gold">
            <p className="text-[11px] text-muted leading-relaxed">
              Please carry this receipt during your visit.<br />
              Valid only on date of issue. Submit at exit gate.
            </p>
            <div className="font-serif italic text-niu-navy text-[13px] mt-1.5">
              — Office of Admissions, NIU —
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={`grid grid-cols-[100px_1fr] py-2 text-[13px] ${
        last ? '' : 'border-b border-dashed border-line-soft'
      }`}
    >
      <div className="text-muted font-mono text-[10px] uppercase tracking-[1px] pt-0.5">
        {label}
      </div>
      <div className="text-ink font-medium">{value}</div>
    </div>
  );
}
