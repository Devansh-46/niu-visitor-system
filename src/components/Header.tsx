'use client';
import { useEffect, useState } from 'react';

export function Header() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      const d = new Date();
      setTime(
        d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' · ' +
        d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
      );
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="bg-niu-navy text-paper px-10 py-[18px] flex items-center justify-between border-b-[3px] border-niu-gold sticky top-0 z-[100] shadow-lg">
      <div className="flex items-center gap-3.5">
        <img src="/logo.png" alt="NIU Logo" className="w-11 h-11 object-contain" />
        <div>
          <h1 className="font-serif text-[19px] font-semibold tracking-[0.3px] leading-none">
            Noida International University
          </h1>
          <p className="font-mono text-[10px] text-niu-gold-soft tracking-[2px] uppercase mt-1">
            Visitor Entry Management System
          </p>
        </div>
      </div>
      <div className="flex items-center gap-6 font-mono text-xs">
        <span><span className="live-dot" />SYSTEM ACTIVE</span>
        <span>{time}</span>
      </div>
    </header>
  );
}
