import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { VersionBadge } from "@/components/ui/version-badge";

// Fonts from the design handoff, loaded the Next way and exposed as the CSS
// variables referenced by globals.css (@theme --font-sans / --font-mono).
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Spectro Web",
  description:
    "Guide & analysis for the Lego Spectrophotometer — Beer-Lambert quantitation that runs entirely in your browser.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Dark is an experimental requirement (stray light contaminates the
  // measurement), so the app is dark-only: `.dark` is always on.
  return (
    <html lang="en" className={`dark ${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
      <body>
        {children}
        <VersionBadge />
      </body>
    </html>
  );
}
