"use client";

import {
  CATEGORY_META,
  VIDEO_CATEGORIES,
  VideoCategory,
} from "@/lib/categories";
import { CategoryIcon } from "@/components/CategoryIcon";

type Props = {
  name?: string;
  value: VideoCategory | null;
  onChange: (value: VideoCategory) => void;
  disabled?: boolean;
  required?: boolean;
};

/**
 * Strict category picker — the only way categories should be chosen in the
 * app. Renders a grid of canonical categories and mirrors the selected value
 * to a hidden input so plain <form> submissions work.
 */
export function CategoryPicker({
  name = "category",
  value,
  onChange,
  disabled,
  required,
}: Props) {
  return (
    <fieldset className="flex flex-col gap-2 text-sm" disabled={disabled}>
      <legend className="text-muted">
        Category{required ? " *" : ""}
      </legend>
      <input type="hidden" name={name} value={value ?? ""} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {VIDEO_CATEGORIES.map((slug) => {
          const meta = CATEGORY_META[slug];
          const selected = value === slug;
          return (
            <button
              key={slug}
              type="button"
              onClick={() => onChange(slug)}
              aria-pressed={selected}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 text-left transition ${
                selected
                  ? "border-accent/70 bg-surface-2"
                  : "border-border bg-surface hover:border-accent/50 hover:bg-surface-2"
              } disabled:opacity-60`}
            >
              <span
                className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded ${meta.badgeClass}`}
              >
                <CategoryIcon category={slug} className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-text">
                  {meta.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {value ? (
        <p className="text-xs text-muted">
          {CATEGORY_META[value].description}
        </p>
      ) : (
        <p className="text-xs text-muted">
          Pick the category that best fits your video.
        </p>
      )}
    </fieldset>
  );
}
