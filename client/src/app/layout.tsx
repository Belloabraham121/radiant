import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Radiant — Your personal AI agent with a wallet, a memory & hands",
  description:
    "Radiant acts, remembers, builds, and earns on your behalf. Tell it what you want in plain language — it does the rest.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/* suppressHydrationWarning: browser extensions and devtools inject
          attributes (e.g. cz-shortcut-listen) before React hydrates */}
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
