import type { Metadata } from "next";
// Self-hosted fonts (no external font CDN requests — privacy by default).
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { CartProvider } from "@/components/cart-provider";

export const metadata: Metadata = {
  title: {
    default: "WebStor — Secure Tech Marketplace",
    template: "%s · WebStor",
  },
  description:
    "A hardened e-commerce experience for electronics, security gear, fashion and more. Encrypted checkout, zero tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} bg-mesh min-h-screen antialiased flex flex-col`}
      >
        <CartProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
