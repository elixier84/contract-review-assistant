import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Contract Review Assistant",
  description: "License compliance audit pre-fieldwork tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
