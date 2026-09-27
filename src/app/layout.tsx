import type { Metadata } from "next";
// Self-hosted Arabic-first variable font (no external font CDN requests).
import "@fontsource-variable/cairo";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { StoreProvider } from "@/components/store-provider";

export const metadata: Metadata = {
  title: {
    default: "خدمتك ستور — خدماتك الرقمية في مكان واحد",
    template: "%s · خدمتك ستور",
  },
  description:
    "خدمتك ستور | Khodmtak Store — اشتراكات رقمية، شحن ألعاب، شحن رصيد، وبطاقات رقمية أصلية. تسليم آمن وسريع في مكان واحد.",
  openGraph: {
    title: "خدمتك ستور | Khodmtak Store",
    description: "خدماتك الرقمية في مكان واحد — اشتراكات، شحن ألعاب، رصيد، وبطاقات رقمية.",
    type: "website",
    locale: "ar_EG",
    siteName: "خدمتك ستور",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="bg-mesh min-h-screen antialiased flex flex-col">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-[100] btn-primary"
        >
          تخطي إلى المحتوى
        </a>
        <StoreProvider>
          <Header />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
        </StoreProvider>
      </body>
    </html>
  );
}
