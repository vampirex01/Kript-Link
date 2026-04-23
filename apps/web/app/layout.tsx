import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Krypt Link",
  description: "Secure short links, real-time analytics, and custom domains",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="grid-overlay">{children}</body>
    </html>
  );
}
