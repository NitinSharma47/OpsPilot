"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, RequestError } from "@/lib/client-api";
import Brand from "@/components/Brand";

const demoAccounts = [
  ["Operations lead", "lead@newtonite.demo"],
  ["Operations member", "member@newtonite.demo"],
  ["Read-only viewer", "viewer@newtonite.demo"],
  ["Administrator", "admin@newtonite.demo"],
];
const quotes = [
  { text: "A thoughtful handoff turns someone else’s next step into a clear one.", author: "An OpsPilot field note" },
  { text: "Urgency moves faster when everyone knows who owns the next move.", author: "An OpsPilot field note" },
  { text: "Good operations are built one clear decision at a time.", author: "An OpsPilot field note" },
  { text: "Make the important work visible; give people room to do it well.", author: "An OpsPilot field note" },
  { text: "Leave the next person more context than you wish you had.", author: "An OpsPilot field note" },
  { text: "Small, reliable updates can make a demanding day feel manageable.", author: "An OpsPilot field note" },
];
const proofPoints = [
  "One accountable owner",
  "A decision trail you can trust",
  "The next step, always in view",
  "Urgency without the uncertainty",
  "Every handoff, with context",
  "A calmer way through busy days",
  "The right people, right on time",
  "Progress you can see together",
  "Clear priorities. Fewer surprises.",
];

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("lead@newtonite.demo");
  const [password, setPassword] = useState("OpsDemo2026!");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<(typeof quotes)[number] | null>(null);
  const [features, setFeatures] = useState<string[]>([]);

  useEffect(() => {
    const choice = quotes[Math.floor(Math.random() * quotes.length)];
    setQuote(choice);
    const shuffled = [...proofPoints];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const otherIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
    }
    setFeatures(shuffled.slice(0, 3));
  }, []);

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
        <Brand />
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
        <p className="login-footnote">OpsPilot · Operations under pressure, handled with care.</p>
      </section>
      <aside className="login-aside">
        <div className="aside-grain" />
        <div className="aside-copy">
          <span className="aside-kicker">A clearer signal in the noise</span>
          <div className="quote-ornament" aria-hidden="true">“</div>
          <blockquote className={`welcome-quote ${quote ? "welcome-quote-ready" : ""}`} key={quote?.text ?? "loading-quote"}>{quote?.text ?? ""}</blockquote>
          <p className={`quote-author ${quote ? "quote-author-ready" : ""}`}>{quote?.author ?? ""}</p>
          <div className="aside-rule" />
          <h2 className="aside-promise">Work that matters.<br /><em>Never lost in the thread.</em></h2>
          <div className="aside-proof">{features.map((text) => <div key={text}><span>{text}</span></div>)}</div>
        </div>
        <div className="aside-footer"><span>BUILT FOR THE MOMENT THAT MATTERS</span><span>A LITTLE CLARITY, EVERY DAY</span></div>
      </aside>
    </main>
  );
}
