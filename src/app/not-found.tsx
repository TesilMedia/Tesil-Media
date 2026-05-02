import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center text-center">
      <h1 className="text-3xl font-semibold">Not found</h1>
      <p className="mt-2 text-muted">
        We couldn't find that page. The link may be broken or the content may
        have been removed.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover"
      >
        Back to home
      </Link>
    </div>
  );
}
