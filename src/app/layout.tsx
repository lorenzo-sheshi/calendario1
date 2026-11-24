import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      "https://preview-chat-8153a93a-6df9-4ed5-b9ce-041b2e9e965b.space-z.ai",
  ),
  title: "Circolari · Belluzzi da Vinci",
  description:
    "Calendario circolari, impegni e compleanni dell'Istituto Belluzzi da Vinci. PWA installabile, funziona offline.",
  keywords: [
    "circolari",
    "Belluzzi da Vinci",
    "calendario scolastico",
    "PWA",
    "compleanni",
    "impegni",
  ],
  authors: [{ name: "Istituto Belluzzi da Vinci" }],
  applicationName: "Circolari",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Circolari",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "msapplication-TileColor": "#2f2a8f",
    "msapplication-tap-highlight": "no",
  },
  openGraph: {
    title: "Circolari · Belluzzi da Vinci",
    description:
      "Calendario circolari, impegni e compleanni dell'Istituto Belluzzi da Vinci.",
    type: "website",
    locale: "it_IT",
    images: [{ url: "/icon-512.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Circolari · Belluzzi da Vinci",
    description: "PWA calendario scolastico",
    images: ["/icon-512.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2f2a8f" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1020" },
  ],
  appleWebApp: {
    capable: true,
    title: "Circolari",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
