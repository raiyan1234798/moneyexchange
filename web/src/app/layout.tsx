import type { Metadata } from "next";
import {
  Anton,
  Baloo_2,
  Bebas_Neue,
  DM_Sans,
  Geist,
  Geist_Mono,
  Inter,
  Lato,
  Lora,
  Merriweather,
  Montserrat,
  Nunito,
  Open_Sans,
  Oswald,
  Pacifico,
  Playfair_Display,
  Poppins,
  Quicksand,
  Roboto,
  Roboto_Mono,
  Roboto_Slab,
  Teko,
  Work_Sans,
} from "next/font/google";
import { AppProviders } from "@/components/providers/app-providers";
import { Toaster } from "@/components/ui/sonner";
import { BRAND } from "@/lib/brand";
import { BUILD_ID } from "@/lib/build-id";
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

// The unimoni brand/creative font — rounded sans used across their promo
// artwork ("Exchange wide range of currencies…"). Self-hosted at build time
// (next/font), so it also works on offline TVs.
const nunito = Nunito({
  variable: "--font-brand",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

// Bold geometric sans matching the unimoni creative headline style
// ("CHOOSE US FOR MONEY EXCHANGE"). Self-hosted for offline TVs.
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// ---- Full selectable font library (self-hosted via next/font for offline TVs).
// Only the font actually applied to on-screen text is downloaded by the browser.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700", "900"] });
const openSans = Open_Sans({ variable: "--font-open-sans", subsets: ["latin"] });
const lato = Lato({ variable: "--font-lato", subsets: ["latin"], weight: ["400", "700", "900"] });
const workSans = Work_Sans({ variable: "--font-work-sans", subsets: ["latin"] });
const oswald = Oswald({ variable: "--font-oswald", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const bebasNeue = Bebas_Neue({ variable: "--font-bebas", subsets: ["latin"], weight: ["400"] });
const anton = Anton({ variable: "--font-anton", subsets: ["latin"], weight: ["400"] });
const teko = Teko({ variable: "--font-teko", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], weight: ["400", "600", "700", "800", "900"] });
const merriweather = Merriweather({ variable: "--font-merriweather", subsets: ["latin"], weight: ["400", "700", "900"] });
const lora = Lora({ variable: "--font-lora", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const robotoSlab = Roboto_Slab({ variable: "--font-roboto-slab", subsets: ["latin"], weight: ["400", "600", "700", "800"] });
const quicksand = Quicksand({ variable: "--font-quicksand", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const baloo2 = Baloo_2({ variable: "--font-baloo", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });
const robotoMono = Roboto_Mono({ variable: "--font-roboto-mono", subsets: ["latin"], weight: ["400", "500", "700"] });
const pacifico = Pacifico({ variable: "--font-pacifico", subsets: ["latin"], weight: ["400"] });

export const metadata: Metadata = {
  title: `${BRAND.displayName} | ${BRAND.pageTitle}`,
  description:
    "unimoni money exchange platform — branch administration, browser-based digital signage, and real-time exchange rate synchronization.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icon-192.png",
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
      suppressHydrationWarning
      className={[
        geistSans.variable,
        geistMono.variable,
        dmSans.variable,
        nunito.variable,
        montserrat.variable,
        poppins.variable,
        inter.variable,
        roboto.variable,
        openSans.variable,
        lato.variable,
        workSans.variable,
        oswald.variable,
        bebasNeue.variable,
        anton.variable,
        teko.variable,
        playfair.variable,
        merriweather.variable,
        lora.variable,
        robotoSlab.variable,
        quicksand.variable,
        baloo2.variable,
        robotoMono.variable,
        pacifico.variable,
        "h-full",
      ].join(" ")}
    >
      <head>
        {/* Stamped per build so the app can detect a genuinely newer deploy by
            comparing this to the BUILD_ID compiled into the running bundle. */}
        <meta name="app-build" content={BUILD_ID} />
      </head>
      <body className="min-h-full bg-background text-foreground antialiased">
        <AppProviders>{children}</AppProviders>
        {/* Top placement keeps success/error toasts clear of sticky Save
            bars and bottom CTAs (logo-upload messages were covering them). */}
        <Toaster richColors closeButton position="top-center" offset={20} />
      </body>
    </html>
  );
}
