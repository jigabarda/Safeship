import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Elegant serif used for display headings — the "premium minimalist" contrast
// against the clean Geist body. Ships at weight 400 only, which is the point.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Safeship",
  description:
    "A friendly security check for AI-assisted developers. Safeship reads your code, finds leaked secrets and known vulnerabilities, and explains them in plain English. It only reads code — it never attacks anything.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <footer className="border-t border-line">
          <div className="mx-auto w-full max-w-5xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted">
            <span>Safeship · static analysis only — it never attacks anything.</span>
            <span>Open-source engines · your code is scanned in a temporary sandbox, never stored.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
