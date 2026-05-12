'use client';

export type Tab = 'entry' | 'log' | 'settings';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const tabs: { id: Tab; icon: string; label: string }[] = [
  { id: 'entry', icon: '📝', label: 'New Entry' },
  { id: 'log', icon: '📋', label: 'Visitor Log' },
  { id: 'settings', icon: '⚙️', label: 'Settings & Setup' },
];

export function Tabs({ active, onChange }: Props) {
  return (
    <nav className="flex bg-paper-warm border-b border-line px-10 overflow-x-auto">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <div
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`px-6 py-3.5 cursor-pointer text-sm font-medium border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              isActive
                ? 'text-niu-navy border-niu-gold'
                : 'text-muted border-transparent hover:text-niu-navy'
            }`}
          >
            <span className="text-base">{t.icon}</span>
            {t.label}
          </div>
        );
      })}
    </nav>
  );
}
