"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  CATEGORY_BADGE_CLASS,
  CATEGORY_META,
  VIDEO_CATEGORIES,
  type VideoCategory,
} from "@/lib/categories";
import { CategoryIcon } from "@/components/CategoryIcon";

const DEFAULT_MAX = 2;

type Props = {
  name?: string;
  secondaryName?: string;
  value: readonly VideoCategory[];
  onChange: (value: VideoCategory[]) => void;
  disabled?: boolean;
  required?: boolean;
  maxSelected?: number;
};

function filterByQuery(query: string): VideoCategory[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...VIDEO_CATEGORIES];
  return VIDEO_CATEGORIES.filter((slug) => {
    const meta = CATEGORY_META[slug];
    return (
      slug.includes(q) ||
      meta.label.toLowerCase().includes(q) ||
      meta.description.toLowerCase().includes(q)
    );
  });
}

/**
 * Searchable category field with optional second selection. Mirrors values to
 * hidden inputs for plain form submissions (`category`, `category2`).
 */
export function CategoryPicker({
  name = "category",
  secondaryName = "category2",
  value,
  onChange,
  disabled,
  required,
  maxSelected = DEFAULT_MAX,
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => filterByQuery(query), [query]);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  function toggle(slug: VideoCategory) {
    const has = value.includes(slug);
    if (has) {
      onChange(value.filter((s) => s !== slug));
      return;
    }
    if (value.length >= maxSelected) return;
    onChange([...value, slug]);
    setQuery("");
  }

  function remove(slug: VideoCategory) {
    onChange(value.filter((s) => s !== slug));
  }

  return (
    <fieldset className="flex flex-col gap-2 text-sm" disabled={disabled}>
      <legend className="text-muted">
        Categories{required ? " *" : ""}
        <span className="font-normal"> — search, up to {maxSelected}</span>
      </legend>
      <input type="hidden" name={name} value={value[0] ?? ""} />
      <input type="hidden" name={secondaryName} value={value[1] ?? ""} />

      <div ref={rootRef} className="relative flex flex-col gap-2">
        {value.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {value.map((slug) => {
              const meta = CATEGORY_META[slug];
              return (
                <span
                  key={slug}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pl-1.5 pr-0.5 text-xs"
                >
                  <span
                    className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded ${CATEGORY_BADGE_CLASS}`}
                  >
                    <CategoryIcon category={slug} className="h-3 w-3" />
                  </span>
                  <span className="max-w-[10rem] truncate pl-0.5">
                    {meta.label}
                  </span>
                  <button
                    type="button"
                    className="rounded-full p-1 text-muted hover:bg-surface hover:text-text"
                    aria-label={`Remove ${meta.label}`}
                    onClick={() => remove(slug)}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}

        <div className="relative">
          <input
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            placeholder="Search categories…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent/60 disabled:opacity-60"
          />
          {open ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border border-border bg-surface py-1 shadow-lg"
            >
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted">No matches.</li>
              ) : (
                filtered.map((slug) => {
                  const selected = value.includes(slug);
                  const atMax = !selected && value.length >= maxSelected;
                  const meta = CATEGORY_META[slug];
                  return (
                    <li key={slug} role="none">
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        disabled={atMax}
                        onClick={() => toggle(slug)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                          selected ? "bg-surface-2/80" : ""
                        }`}
                      >
                        <span
                          className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded ${CATEGORY_BADGE_CLASS}`}
                        >
                          <CategoryIcon category={slug} className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-text">
                            {meta.label}
                            {selected ? " · selected" : ""}
                          </span>
                          <span className="block truncate text-[11px] text-muted">
                            {meta.description}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          ) : null}
        </div>
      </div>

      {value.length > 0 ? (
        <p className="text-xs text-muted">
          {value.map((slug) => CATEGORY_META[slug].description).join(" · ")}
        </p>
      ) : (
        <p className="text-xs text-muted">
          {required
            ? "Pick at least one category (you can add a second if it fits)."
            : "Search and pick up to two categories."}
        </p>
      )}
    </fieldset>
  );
}
