import type { Metadata } from "next";
import "@ranza/ui/tokens.css";

export const metadata: Metadata = {
  description:
    "Operations software for independent student-dormitory Operators in Turkey.",
  title: "Ranza",
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
