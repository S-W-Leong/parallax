import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parallax",
  description: "AI-generated 3D cutaway lessons for machines",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
