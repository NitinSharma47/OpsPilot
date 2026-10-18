import Link from "next/link";

export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg className={`brand-mark ${className}`.trim()} viewBox="0 0 40 40" role="img" aria-label="OpsPilot">
      <rect width="40" height="40" rx="12" fill="currentColor" />
      <path d="M11 18.5 20 10l9 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15a1.5 1.5 0 0 1-1.5-1.5v-10Z" fill="none" stroke="white" strokeWidth="2" strokeLinejoin="round" />
      <path d="m16 22 3 3 6-7" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="29" cy="11" r="2.4" fill="#e5b981" />
    </svg>
  );
}

export default function Brand({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link className={`brand ${className}`.trim()} href={href} aria-label="OpsPilot home">
      <BrandMark />
      <span>OpsPilot<span className="brand-period">.</span></span>
    </Link>
  );
}
