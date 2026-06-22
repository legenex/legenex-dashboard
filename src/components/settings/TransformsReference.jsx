import { toast } from 'sonner';

const TRANSFORMS = [
  { suffix: '|lowercase', desc: 'Convert to lowercase' },
  { suffix: '|uppercase', desc: 'Convert to uppercase' },
  { suffix: '|trim', desc: 'Strip whitespace' },
  { suffix: '|sha256', desc: 'SHA-256 hash' },
  { suffix: '|phone_us', desc: 'US phone → 1XXXXXXXXXX' },
];

export function insertAtCursor(text) {
  const el = document.activeElement;
  if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && typeof el.selectionStart === 'number') {
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const value = el.value;
    const newValue = value.slice(0, start) + text + value.slice(end);
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement : window.HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, 'value')?.set;
    if (setter) setter.call(el, newValue);
    else el.value = newValue;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.setSelectionRange(start + text.length, start + text.length);
    el.focus();
  } else {
    navigator.clipboard.writeText(text);
    toast.success('Copied: ' + text);
  }
}

export default function TransformsReference() {
  return (
    <div>
      <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Transforms</div>
      <div className="space-y-1">
        {TRANSFORMS.map(t => (
          <div key={t.suffix} className="flex items-center gap-2">
            <code
              className="text-[11px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded cursor-pointer hover:bg-primary/20 shrink-0"
              onClick={() => insertAtCursor(t.suffix)}
              title={t.desc}
            >
              {t.suffix}
            </code>
            <span className="text-[10px] text-muted-foreground">{t.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}