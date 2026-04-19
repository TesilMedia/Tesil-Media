import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/lib/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const { error, callbackUrl } = await searchParams;

  async function submit(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    await signIn("credentials", {
      email,
      password,
      redirectTo: String(formData.get("callbackUrl") ?? "/"),
    });
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="mb-1 text-2xl font-semibold">Sign in to TESIL</h1>
      <p className="mb-6 text-sm text-muted">
        Welcome back. Sign in to follow channels and go live.
      </p>

      {error ? (
        <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          Could not sign in. Check your email and password.
        </div>
      ) : null}

      <form action={submit} className="flex flex-col gap-3">
        <input type="hidden" name="callbackUrl" value={callbackUrl ?? "/"} />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted">Password</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent/60"
          />
        </label>
        <button
          type="submit"
          className="mt-2 rounded-md bg-accent py-2 text-sm font-semibold text-bg hover:bg-accent-hover"
        >
          Sign in
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Don't have an account?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Sign up
        </Link>
      </p>
      <p className="mt-2 text-xs text-muted">
        Demo login: <code>becknerd@tesil.media</code> /{" "}
        <code>password123</code>
      </p>
    </div>
  );
}
