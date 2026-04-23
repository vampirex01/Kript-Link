"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/use-auth";

const schema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const { register: registerUser, getApiErrorMessage } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    setSuccess(null);

    try {
      const result = await registerUser(values.email, values.password);
      setSuccess(result.message);
    } catch (submitError) {
      setError(getApiErrorMessage(submitError) ?? "Could not create account");
    }
  };

  return (
    <main className="page-enter mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-16">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full rounded-2xl border border-ink/10 bg-white/80 p-7 shadow-xl backdrop-blur"
      >
        <h1 className="font-display text-3xl text-ink">Create account</h1>
        <p className="mt-1 text-sm text-ink/60">
          Start shortening links in seconds.
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

        <label className="mt-4 block text-sm font-medium text-ink">
          Confirm password
        </label>
        <input
          type="password"
          className="mt-2 w-full rounded-xl border border-ink/20 bg-white px-4 py-3 outline-none transition focus:border-ember"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword ? (
          <p className="mt-1 text-xs text-red-600">
            {errors.confirmPassword.message}
          </p>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        {success ? (
          <p className="mt-3 rounded-lg bg-moss/10 px-3 py-2 text-sm text-moss">
            {success}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 w-full rounded-xl bg-ink px-4 py-3 font-semibold text-white transition hover:bg-ink/90 disabled:opacity-60"
        >
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>

        <p className="mt-4 text-sm text-ink/70">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-ember">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
