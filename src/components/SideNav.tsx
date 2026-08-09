"use client";

import { useEffect, useState } from "react";

/**
 * Section navigation, pinned alongside the content.
 *
 * The page is long by necessity — an eligibility screen, a ranking, scenarios
 * and the evidence behind all three. A persistent rail keeps the structure
 * visible so a reader can tell where the argument goes next without scrolling
 * to find out, and marks where they currently are.
 *
 * Collapses to a horizontal bar under `lg`, where a 260px rail would take a
 * third of the width.
 */

export interface Section {
  id: string;
  label: string;
  /** Short gloss of what the section answers. Rail only, where there is room. */
  hint: string;
}

export function SideNav({ sections }: { sections: Section[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    // Bias the intersection band toward the upper third: the section a reader
    // considers "current" is the one they are reading at the top of the
    // viewport, not whatever happens to be centred.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-10% 0px -70% 0px", threshold: 0 },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Sections" className="lg:sticky lg:top-6">
      <p className="hidden text-xs font-medium uppercase tracking-wide text-[var(--text-muted)] lg:block">
        On this page
      </p>
      <ul className="mt-0 flex gap-1 overflow-x-auto lg:mt-3 lg:block lg:space-y-0.5 lg:overflow-visible">
        {sections.map((s) => {
          const current = s.id === active;
          return (
            <li key={s.id} className="shrink-0">
              <a
                href={`#${s.id}`}
                aria-current={current ? "location" : undefined}
                className="block rounded px-2.5 py-1.5 text-sm transition-colors lg:border-l-2 lg:pl-3"
                style={{
                  color: current
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                  background: current ? "var(--surface-1)" : "transparent",
                  borderLeftColor: current
                    ? "var(--series-cost)"
                    : "transparent",
                  fontWeight: current ? 500 : 400,
                }}
              >
                {s.label}
                <span className="hidden text-xs text-[var(--text-muted)] lg:mt-0.5 lg:block">
                  {s.hint}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
