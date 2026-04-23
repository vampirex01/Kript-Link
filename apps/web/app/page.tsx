import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-enter mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-20">
      <section className="cyber-card stagger-in w-full rounded-3xl p-10 backdrop-blur">
        <p className="hud-pill mb-3 inline-flex rounded-full px-4 py-2 font-display text-sm uppercase tracking-[0.12em]">
          Encrypted Link Ops
        </p>
        <h1 className="font-display text-5xl leading-tight text-ink">
          Move links at network speed, with crypt-grade control.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink/70">
          Krypt Link is a hardened short URL command center with geo-routing,
          real-time analytics, custom domains, API keys, and webhook automation.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/register"
            className="rounded-xl bg-ember px-5 py-3 font-semibold text-ink transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_0_26px_rgba(0,245,255,0.38)]"
          >
            Create account
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-ink/20 bg-white/80 px-5 py-3 font-semibold text-ink transition duration-200 hover:-translate-y-0.5 hover:border-ember/50"
          >
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
