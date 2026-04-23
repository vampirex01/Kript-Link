"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/use-auth";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, getApiErrorMessage } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);

    try {
      await login(values.email, values.password);
      router.push("/dashboard");
    } catch (submitError) {
      setError(getApiErrorMessage(submitError) ?? "Invalid credentials");
    }
  };

  return (
    <main className="page-enter mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-16">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full rounded-2xl border border-ink/10 bg-white/80 p-7 shadow-xl backdrop-blur"
      >
        <h1 className="font-display text-3xl text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink/60">
          Welcome back to your link workspace.
        </p>

        <label className="mt-5 block text-sm font-medium text-ink">Email</label>
        <input
          type="email"
          className="mt-2 w-full rounded-xl border border-ink/20 bg-white px-4 py-3 outline-none transition focus:border-ember"
          {...register("email")}
        />
        {errors.email ? (
          <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
        ) : null}

        <label className="mt-4 block text-sm font-medium text-ink">
          Password
        </label>
        <input
          type="password"
          className="mt-2 w-full rounded-xl border border-ink/20 bg-white px-4 py-3 outline-none transition focus:border-ember"
          {...register("password")}
        />
        {errors.password ? (
          <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
        ) : null}
        <div className="mt-2 text-right">
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-ember"
          >
            Forgot password?
          </Link>
        </div>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded-xl bg-ink px-4 py-3 font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>

        <p className="mt-4 text-sm text-ink/70">
          New here?{" "}
          <Link href="/register" className="font-semibold text-ember">
            Create account
          </Link>
        </p>
      </form>
    </main>
  );
}
