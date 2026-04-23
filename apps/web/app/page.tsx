import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-enter mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-20">
      <section className="w-full rounded-3xl border border-amber-900/20 bg-white/70 p-10 shadow-[0_25px_60px_rgba(32,32,33,0.12)] backdrop-blur">
        <p className="mb-3 inline-flex rounded-full bg-ember/10 px-4 py-2 font-display text-sm uppercase tracking-[0.12em] text-ember">
          Smart Link Platform
        </p>
        <h1 className="font-display text-5xl leading-tight text-ink">
          Build, route, and measure every short link.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink/70">
          A complete URL shortener stack with auth, geo-routing, analytics,
          custom domains, API keys, and webhooks.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/register"
            className="rounded-xl bg-ink px-5 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-ink/90"
          >
            Create account
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-ink/20 bg-white px-5 py-3 font-semibold text-ink transition hover:-translate-y-0.5"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
