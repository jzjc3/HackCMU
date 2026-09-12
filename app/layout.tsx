import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mind Travel",
  description: "Travel through your memories. A personal world shaped by the experiences that matter to you.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
