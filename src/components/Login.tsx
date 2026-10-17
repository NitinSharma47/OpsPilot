"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, RequestError } from "@/lib/client-api";

const demoAccounts = [
  ["Operations lead", "lead@newtonite.demo"],
  ["Operations member", "member@newtonite.demo"],
  ["Read-only viewer", "viewer@newtonite.demo"],
  ["Administrator", "admin@newtonite.demo"],
];

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("lead@newtonite.demo");
  const [password, setPassword] = useState("OpsDemo2026!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.replace("/");
    } catch (reason) {
      setError(reason instanceof RequestError ? reason.message : "Unable to sign in. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <a className="brand" href="/" aria-label="Fieldnote home">
          <span className="brand-mark">F</span><span>fieldnote<span className="brand-period">.</span></span>
        </a>
        <div className="login-copy">
          <p className="eyebrow">OPERATIONS WORKSPACE</p>
          <h1>Good work starts with a clear handoff.</h1>
          <p>One calm place to take ownership, make decisions, and keep every important detail in view.</p>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="email">Work email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-wide" type="submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"} <span aria-hidden="true">→</span>
          </button>
        </form>
        <div className="demo-note">
          <div className="demo-note-title"><span className="status-dot green-dot" /> DEMO ACCESS</div>
          <p>All demo accounts use <code>OpsDemo2026!</code>.</p>
          <div className="demo-accounts">
            {demoAccounts.map(([label, account]) => (
              <button key={account} type="button" onClick={() => setEmail(account)}>
                <span>{label}</span><span className="demo-email">{account}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="login-footnote">Newtonite · Operations under pressure, handled with care.</p>
      </section>
      <aside className="login-aside">
        <div className="aside-grain" />
        <div className="aside-copy">
          <span className="aside-kicker">A clearer signal in the noise</span>
          <h2>Work that matters.<br /><em>Never lost in the thread.</em></h2>
          <div className="aside-rule" />
          <div className="aside-proof">
            <div><strong>01</strong><span>One accountable owner</span></div>
            <div><strong>02</strong><span>A decision trail you can trust</span></div>
            <div><strong>03</strong><span>The next step, always in view</span></div>
          </div>
        </div>
        <div className="aside-footer"><span>BUILT FOR THE MOMENT THAT MATTERS</span><span>01 — 04</span></div>
      </aside>
    </main>
  );
}
