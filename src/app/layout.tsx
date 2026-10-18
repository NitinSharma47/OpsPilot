import type { Metadata } from "next";
import ThemeProvider from "@/components/ThemeProvider";
import Brand from "@/components/Brand";
import "./globals.css";

const themeBootstrap = `try{const t=localStorage.getItem("opspilot-theme");if(["light","dark","classic","lovely"].includes(t))document.documentElement.dataset.theme=t}catch{}`;

export const metadata: Metadata = {
  title: "OpsPilot | Operations",
  description: "A reliable workspace for operational work across teams.",
  applicationName: "OpsPilot",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
