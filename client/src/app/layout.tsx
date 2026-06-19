import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { PrivyAuthProvider } from "@/components/providers/PrivyAuthProvider";
import {
  getSiteUrl,
  siteDescription,
  siteName,
  siteShareDescription,
  siteTitle,
} from "@/lib/site-metadata";
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
  metadataBase: getSiteUrl(),
  title: {
    default: siteTitle,
    template: `%s · ${siteName}`,
  },
  description: siteDescription,
  applicationName: siteName,
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName,
    title: siteTitle,
    description: siteShareDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: siteShareDescription,
  },
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
        <PrivyAuthProvider>{children}</PrivyAuthProvider>
      </body>
    </html>
  );
}
