import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";

interface DateTimePickerProps {
  value: string;
  onChange: (iso: string | null) => void;
  placeholder?: string;
}

function formatDisplay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toTimeString(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick a date & time",
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    value ? new Date(value) : undefined,
  );
  const [timeStr, setTimeStr] = useState<string>(value ? toTimeString(value) : "00:00");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value) {
      setSelectedDate(new Date(value));
      setTimeStr(toTimeString(value));
    } else {
      setSelectedDate(undefined);
      setTimeStr("00:00");
    }
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function commit(date: Date | undefined, time: string) {
    if (!date) return;
    const [h, m] = time.split(":").map(Number);
    const result = new Date(date);
    result.setHours(h, m, 0, 0);
    onChange(result.toISOString());
  }

  function handleDaySelect(day: Date | undefined) {
    setSelectedDate(day);
    if (day) commit(day, timeStr);
  }

  function handleTimeChange(e: React.ChangeEvent<HTMLInputElement>) {
    setTimeStr(e.target.value);
    if (selectedDate) commit(selectedDate, e.target.value);
  }

  function handleClear() {
    setSelectedDate(undefined);
    setTimeStr("00:00");
    onChange(null);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5 text-left text-sm transition-colors focus:border-border-focus focus:outline-none"
      >
        {value ? (
          <span className="text-ink">{formatDisplay(value)}</span>
        ) : (
          <span className="text-ink-muted">{placeholder}</span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 rounded-xl border border-border bg-surface-elevated p-3 shadow-modal">
          <DayPicker
            mode="single"
            selected={selectedDate}
            onSelect={handleDaySelect}
            classNames={{
              root: "text-sm",
              months: "",
              month: "",
              month_caption: "flex items-center justify-between mb-2 px-1",
              caption_label: "text-sm font-semibold text-ink",
              nav: "flex items-center gap-1",
              button_previous:
                "flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink",
              button_next:
                "flex h-7 w-7 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink",
              month_grid: "w-full border-collapse",
              weekdays: "",
              weekday: "w-9 pb-1 text-center text-xs font-medium text-ink-muted",
              week: "",
              day: "p-0",
              day_button:
                "mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-sm transition-colors hover:bg-surface-hover",
              selected:
                "bg-accent text-accent-fg rounded-lg hover:bg-accent",
              today: "font-bold text-accent",
              outside: "opacity-30",
              disabled: "opacity-30 cursor-not-allowed",
            }}
          />

          <div className="mt-2 border-t border-border pt-2">
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Time
            </label>
            <input
              type="time"
              value={timeStr}
              onChange={handleTimeChange}
              className="w-full rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5 text-sm text-ink focus:border-border-focus focus:outline-none transition-colors"
            />
          </div>

          <button
            type="button"
            onClick={handleClear}
            className="mt-2 w-full rounded-lg px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
