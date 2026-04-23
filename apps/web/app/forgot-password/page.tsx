"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    setState("sending");

    try {
      await api.post("/api/auth/forgot-password", { email });
      setState("sent");
      setEmail("");
    } catch {
      setState("error");
    }
  };

  return (
    <main className="page-enter mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-16">
      <form
        onSubmit={onSubmit}
        className="w-full rounded-2xl border border-ink/10 bg-white/80 p-7 shadow-xl backdrop-blur"
      >
        <h1 className="font-display text-3xl text-ink">Forgot password</h1>
        <p className="mt-1 text-sm text-ink/60">
          Enter your email and we will send reset instructions.
        </p>

        <label className="mt-5 block text-sm font-medium text-ink">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full rounded-xl border border-ink/20 bg-white px-4 py-3 outline-none transition focus:border-ember"
        />

        <button
          type="submit"
          disabled={state === "sending"}
          className="mt-6 w-full rounded-xl bg-ink px-4 py-3 font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60"
        >
          {state === "sending" ? "Sending..." : "Send reset link"}
        </button>

        {state === "sent" ? (
          <p className="mt-3 text-sm text-moss">
            Check your email if an account exists for that address.
          </p>
        ) : null}

        {state === "error" ? (
          <p className="mt-3 text-sm text-red-600">
            Unable to process request right now.
          </p>
        ) : null}

        <p className="mt-4 text-sm text-ink/70">
          Back to{" "}
          <Link href="/login" className="font-semibold text-ember">
            sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
