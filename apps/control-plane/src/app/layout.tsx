import type { Metadata } from "next";
import "@ranza/ui/tokens.css";

export const metadata: Metadata = {
  description: "Internal administration surface for the Ranza service.",
  title: "Ranza Control Plane",
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
