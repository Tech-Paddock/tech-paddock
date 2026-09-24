"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { safeRedirectTarget } from "@/lib/safe-redirect";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let res: Response;
    try {
      res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
    } catch {
      // A dropped connection used to leave the button on "Checking…" for good.
      setLoading(false);
      setError("Couldn't reach the server. Check the connection and try again.");
      return;
    }

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
      return;
    }

    // Only a path on this origin is followed; anything else goes to "/".
    // lib/safe-redirect.ts says why.
    router.push(safeRedirectTarget(params.get("from"), window.location.origin));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm bg-surface border border-line rounded-2xl p-8 flex flex-col gap-4"
    >
      <h1 className="text-xl font-semibold">Resume Formatter</h1>
      <p className="text-sm text-ink/70">Enter the password to continue.</p>
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2 pr-16 outline-none focus:border-accent"
          placeholder="Password"
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink/60 hover:text-ink"
          tabIndex={-1}
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      {error && <p className="text-sm text-urgent">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="bg-accent text-accent-ink rounded-lg px-3 py-2 font-medium disabled:opacity-60"
      >
        {loading ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
