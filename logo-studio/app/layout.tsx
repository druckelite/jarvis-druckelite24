import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Druckelite24 Logo Studio",
  description: "Kundenlogos automatisch originalgetreu rekonstruieren, sauber freistellen und druckfertig herunterladen.",
  openGraph: {
    title: "Druckelite24 Logo Studio",
    description: "Vom Kundenlogo zur sauberen Druckdatei.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Druckelite24 Logo Studio" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Druckelite24 Logo Studio",
    description: "Vom Kundenlogo zur sauberen Druckdatei.",
    images: ["/og.png"],
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}
