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
    <form onSubmit={handleSubmit} className="login-form">
      <p className="eyebrow">Paddock</p>
      <h1>Enter the password</h1>
      <p className="description">One login gets you into every tool.</p>
      <div className="password-field">
        <input
          type={showPassword ? "text" : "password"}
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        <button type="button" onClick={() => setShowPassword((v) => !v)} tabIndex={-1}>
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={loading} className="open-button submit-button">
        {loading ? "Checking…" : "Enter"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="login-shell">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
