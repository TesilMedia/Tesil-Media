import type { VideoCategory } from "@/lib/categories";

type Props = {
  category: VideoCategory;
  className?: string;
};

/**
 * Small stroke icons for each canonical video category (sidebar, picker, headers).
 */
export function CategoryIcon({ category, className = "h-4 w-4" }: Props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {iconPaths(category)}
    </svg>
  );
}

function iconPaths(slug: VideoCategory) {
  switch (slug) {
    case "gaming":
      return (
        <>
          <path d="M6.68 5h10.64a4 4 0 0 1 3.98 4.5v5a4 4 0 0 1-3.98 4.5H6.68a4 4 0 0 1-3.98-4.5v-5A4 4 0 0 1 6.68 5Z" />
          <line x1="8" x2="8" y1="11" y2="13" />
          <line x1="7" x2="9" y1="12" y2="12" />
          <line x1="15" x2="15.01" y1="12" y2="12" />
          <line x1="18" x2="18.01" y1="12" y2="12" />
        </>
      );
    case "music":
      return (
        <>
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </>
      );
    case "tech":
      return (
        <>
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </>
      );
    case "film":
      return (
        <>
          <rect width="14" height="12" x="2" y="6" rx="2" />
          <path d="m22 8-6 4 6 4V8Z" />
        </>
      );
    case "sports":
      return (
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      );
    case "news":
      return (
        <>
          <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" x2="8" y1="13" y2="13" />
          <line x1="16" x2="8" y1="17" y2="17" />
          <line x1="10" x2="8" y1="9" y2="9" />
        </>
      );
    case "education":
      return (
        <>
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </>
      );
    case "comedy":
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" x2="9.01" y1="9" y2="9" />
          <line x1="15" x2="15.01" y1="9" y2="9" />
        </>
      );
    case "entertainment":
      return (
        <>
          <rect width="20" height="15" x="2" y="7" rx="2" />
          <polyline points="17 2 12 7 7 2" />
        </>
      );
    case "vlogs":
      return (
        <>
          <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
          <circle cx="12" cy="13" r="3" />
        </>
      );
    case "ambient":
      return (
        <>
          <path d="M2 10v4" />
          <path d="M6 6v12" />
          <path d="M10 3v18" />
          <path d="M14 6v12" />
          <path d="M18 10v4" />
        </>
      );
    case "art":
      return (
        <>
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </>
      );
    case "other":
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </>
      );
  }
}
