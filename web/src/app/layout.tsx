import type { Metadata } from "next";
import { DM_Sans, Geist, Geist_Mono } from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-heading",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "MoneyExchangeTV | Enterprise Digital Signage",
  description:
    "Enterprise money exchange management platform with branch administration, browser-based digital signage, and real-time exchange rate synchronization.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} h-full`}>
      <body className="min-h-full bg-background text-foreground antialiased">
        <AppProviders>{children}</AppProviders>
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
