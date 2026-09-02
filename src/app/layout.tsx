import type { Metadata } from "next";
import { Fredoka } from "next/font/google";
import "./globals.css";

const raceFont = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-race",
});

export const metadata: Metadata = {
  title: "Typing Race",
  description: "Multiplayer real-time typing competition",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={raceFont.variable}>{children}</body>
    </html>
  );
}
