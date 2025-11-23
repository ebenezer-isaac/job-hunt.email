import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { createDebugLogger } from "@/lib/debug-logger";
import "@/lib/logging/server-writer-bootstrap";
import { ToasterProvider } from "@/components/ui/ToasterProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://job-hunt.email";
const metadataBase = (() => {
  try {
    return new URL(appUrl);
  } catch {
    return new URL("https://job-hunt.email");
  }
})();
const ogImage = new URL("/api/og", metadataBase).toString();

export const metadata: Metadata = {
  metadataBase,
  applicationName: "job-hunt.email",
  title: "Job-Hunt.Email · AI Job Application Assisstant",
  description: "Job-Hunt.Email generates resumes, cover letters, and cold emails tailored to each job application with the click of a button.",
  keywords: ["job hunting", "AI", "resume", "cover letter", "cold email", "cv customiser", "custom cv", "job applications","email finder", "job search assistant"],
  openGraph: {
    title: "Job-Hunt.Email · AI Job Application Assisstant",
    description:
      "Generate tailored CVs, cover letters, and outreach cold emails with the click of a button.",
    url: metadataBase.origin,
    siteName: "Job-Hunt.Email",
    images: [{ url: ogImage, width: 1200, height: 630, alt: "job-hunt.email preview" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "job-hunt.email",
    description: "AI Job Application Assisstant for custom CVs, cover letters, and cold outreach.",
    images: [ogImage],
  },
};

const layoutLogger = createDebugLogger("app-layout");
layoutLogger.step("Root layout module loaded", {
  geistSans: geistSans.variable,
  geistMono: geistMono.variable,
});
layoutLogger.data("layout-metadata", metadata);

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  layoutLogger.step("RootLayout render invoked", {
    hasChildren: Boolean(children),
  });
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark')
                } else {
                  document.documentElement.classList.remove('dark')
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-full`}
      >
        <ToasterProvider />
        {children}
      </body>
    </html>
  );
}
