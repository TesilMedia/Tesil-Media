import { ContentRating, RATING_META, isContentRating } from "@/lib/ratings";

type Props = {
  rating: string | null | undefined;
  /** Controls padding / font size. */
  size?: "xs" | "sm";
  className?: string;
  title?: string;
};

export function RatingBadge({ rating, size = "xs", className, title }: Props) {
  if (!isContentRating(rating)) return null;
  if (rating !== "X") return null;
  const meta = RATING_META[rating as ContentRating];
  const sizeClass =
    size === "sm"
      ? "px-1.5 py-0.5 text-[11px]"
      : "px-1 py-0 text-[10px] leading-[14px]";
  return (
    <span
      title={title ?? meta.description}
      className={`inline-flex shrink-0 items-center justify-center rounded font-display uppercase tracking-wider ${meta.badgeClass} ${sizeClass} ${className ?? ""}`}
    >
      {meta.label}
    </span>
  );
}
