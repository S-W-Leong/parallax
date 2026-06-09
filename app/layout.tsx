import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parallax",
  description: "Agent-generated interactive 3D learning rooms for STEM topics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
