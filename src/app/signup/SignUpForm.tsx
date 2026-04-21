"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export function SignUpForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);
    const payload = {
      email: String(fd.get("email") ?? ""),
      password: String(fd.get("password") ?? ""),
      name: String(fd.get("name") ?? "") || undefined,
    };

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Sign up failed.");
        setSubmitting(false);
        return;
      }

      const signInResult = await signIn("credentials", {
        email: payload.email,
        password: payload.password,
        redirect: false,
      });

      if (signInResult?.error) {
        setError("Account created but sign in failed. Try signing in.");
        setSubmitting(false);
        router.push("/signin");
        return;
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("Network error.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {error ? (
        <div className="rounded-md border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger">
          {error}
        </div>
      ) : null}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Display name (optional)</span>
        <input
          name="name"
          type="text"
          maxLength={40}
          className="rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent/60"
        />
      </label>
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
        <span className="text-muted">Password (min 8 characters)</span>
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-border bg-surface px-3 py-2 outline-none focus:border-accent/60"
        />
      </label>
      <button
        type="submit"
        disabled={submitting}
        className="mt-2 rounded-md bg-accent py-2 text-sm font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-60"
      >
        {submitting ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
