import type { Metadata } from "next";
import "@ranza/ui/tokens.css";

export const metadata: Metadata = {
  description: "Ranza Student App and Operator Dashboard.",
  title: "Ranza Product",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
