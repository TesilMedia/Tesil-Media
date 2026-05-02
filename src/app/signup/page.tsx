import Link from "next/link";
import { redirect } from "next/navigation";

import { SignUpForm } from "./SignUpForm";
import { auth } from "@/lib/auth";

export default async function SignUpPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="mx-auto w-full max-w-md py-16">
      <h1 className="mb-1 text-2xl font-semibold">Create your Tesil account</h1>
      <p className="mb-6 text-sm text-muted">
        Sign up to follow channels and (eventually) start your own.
      </p>
      <SignUpForm />
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/signin" className="text-accent-blue hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
