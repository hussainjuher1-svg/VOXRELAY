import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarDays, Globe, Headset, Moon, Search, ShieldCheck, Sun, X } from 'lucide-react';
import { useLocale, useTheme } from '../../context/hooks';

const PALETTE_ITEMS = [
  { id: 'home', label: 'Home', section: 'Navigate', to: '/', icon: ArrowRight },
  { id: 'how', label: 'How it works', section: 'Navigate', to: '/how-it-works', icon: ArrowRight },
  { id: 'privacy', label: 'Privacy & boundaries', section: 'Navigate', to: '/privacy', icon: ShieldCheck },
  { id: 'faq', label: 'FAQ & knowledge base', section: 'Navigate', to: '/faq', icon: BookOpen },
  { id: 'contact', label: 'Request access / contact', section: 'Navigate', to: '/contact', icon: Headset },
  { id: 'status', label: 'System status', section: 'Navigate', to: '/status', icon: ArrowRight },
  { id: 'app', label: 'Workspace overview', section: 'Workspace', to: '/app', icon: CalendarDays },
  { id: 'ops', label: 'Ops queues', section: 'Workspace', to: '/app/ops', icon: CalendarDays },
  { id: 'assignments', label: 'Assignments & schedule', section: 'Workspace', to: '/app/assignments', icon: CalendarDays },
  { id: 'availability', label: 'Availability & overrides', section: 'Workspace', to: '/app/availability', icon: CalendarDays },
  { id: 'terminology', label: 'Terminology glossary', section: 'Workspace', to: '/app/terminology', icon: BookOpen },
  { id: 'device', label: 'Device & network readiness check', section: 'Workspace', to: '/app/device-check', icon: ShieldCheck },
  { id: 'billing', label: 'Billing & time logs', section: 'Workspace', to: '/app/billing', icon: CalendarDays },
  { id: 'reports', label: 'Reports & totals', section: 'Workspace', to: '/app/reports', icon: BookOpen },
  { id: 'quality', label: 'Quality indicators', section: 'Workspace', to: '/app/quality', icon: ShieldCheck },
  { id: 'support', label: 'Human support tickets', section: 'Workspace', to: '/app/support', icon: Headset },
  { id: 'admin', label: 'Access review queue & outbox', section: 'Workspace', to: '/app/admin', icon: ShieldCheck },
  { id: 'settings', label: 'Settings & sessions', section: 'Workspace', to: '/app/settings', icon: Globe },
];

export function CommandPalette({
  open,
  onOpenChange,
  onOpenAssistant,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onOpenAssistant?: () => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const { toggleLocale, tr } = useLocale();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const q = query.trim().toLowerCase();
  const filtered = PALETTE_ITEMS.filter(
    (item) => !q || item.label.toLowerCase().includes(q) || item.section.toLowerCase().includes(q)
  );

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery('');
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="ui-dialog-overlay" />
        <Dialog.Content className="ui-palette-content" aria-label="Command palette">
          <div className="ui-palette-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              dir="auto"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jump to a route, workspace tool, or action..."
            />
            <Dialog.Close className="icon-button" aria-label="Close command palette">
              <X size={16} />
            </Dialog.Close>
          </div>
          <div className="ui-palette-list">
            {filtered.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className="ui-palette-item"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(item.to);
                  }}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span>{item.label}</span>
                  <span className="ui-palette-section">{item.section}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="ui-palette-item"
              onClick={() => {
                toggleTheme();
                onOpenChange(false);
              }}
            >
              {theme === 'light' ? <Moon size={15} aria-hidden="true" /> : <Sun size={15} aria-hidden="true" />}
              <span>Switch to {theme === 'light' ? 'dark' : 'light'} theme</span>
              <span className="ui-palette-section">Action</span>
            </button>
            <button
              type="button"
              className="ui-palette-item"
              onClick={() => {
                toggleLocale();
                onOpenChange(false);
              }}
            >
              <Globe size={15} aria-hidden="true" />
              <span>{tr('nav.switchLang')}</span>
              <span className="ui-palette-section">Locale</span>
            </button>
            {onOpenAssistant && (
              <button
                type="button"
                className="ui-palette-item"
                onClick={() => {
                  onOpenChange(false);
                  onOpenAssistant();
                }}
              >
                <BookOpen size={15} aria-hidden="true" />
                <span>Open Workspace Assistant (Ask &amp; Research)</span>
                <span className="ui-palette-section">Cmd+/</span>
              </button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
