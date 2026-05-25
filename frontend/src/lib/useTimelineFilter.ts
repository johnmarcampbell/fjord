import { useCallback, useEffect, useRef, useState } from "react";

export interface TimelineFilterState {
  comments: boolean;
  journal: boolean;
  system: boolean;
}

const STORAGE_KEY = "ak-timeline-filter";
const DEFAULT_FILTER: TimelineFilterState = { comments: true, journal: false, system: false };

type Subscriber = (filter: TimelineFilterState) => void;
const subscribers = new Set<Subscriber>();

function loadFilter(): TimelineFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTER;
    const p = JSON.parse(raw) as Record<string, unknown>;
    return {
      comments: typeof p.comments === "boolean" ? p.comments : DEFAULT_FILTER.comments,
      journal: typeof p.journal === "boolean" ? p.journal : DEFAULT_FILTER.journal,
      system: typeof p.system === "boolean" ? p.system : DEFAULT_FILTER.system,
    };
  } catch {
    return DEFAULT_FILTER;
  }
}

function saveFilter(filter: TimelineFilterState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filter));
  } catch {
    // ignore storage errors
  }
}

function notify(filter: TimelineFilterState) {
  subscribers.forEach((fn) => fn(filter));
}

export function useTimelineFilter() {
  const [filter, setFilter] = useState<TimelineFilterState>(loadFilter);
  // Track latest filter in a ref so toggle/solo don't need stale closures or
  // functional updaters (which cause Strict Mode double-invocation issues when
  // side effects are needed alongside the update).
  const latestFilter = useRef(filter);
  latestFilter.current = filter;

  useEffect(() => {
    const subscriber: Subscriber = (next) => setFilter(next);
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
    };
  }, []);

  const toggle = useCallback((kind: keyof TimelineFilterState) => {
    const next = { ...latestFilter.current, [kind]: !latestFilter.current[kind] };
    latestFilter.current = next;
    saveFilter(next);
    setFilter(next);
    notify(next);
  }, []);

  const solo = useCallback((kind: keyof TimelineFilterState) => {
    const next: TimelineFilterState = { comments: false, journal: false, system: false };
    next[kind] = true;
    latestFilter.current = next;
    saveFilter(next);
    setFilter(next);
    notify(next);
  }, []);

  return { filter, toggle, solo };
}

export function eventMatchesFilter(kind: string, filter: TimelineFilterState): boolean {
  if (kind === "comment") return filter.comments;
  if (kind === "journal_entry") return filter.journal;
  return filter.system;
}
