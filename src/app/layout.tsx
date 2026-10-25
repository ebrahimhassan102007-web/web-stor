import type { Metadata } from "next";
// Self-hosted fonts (no external font CDN requests — privacy by default).
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource-variable/cairo"; // Arabic (used when lang="ar")
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { FooterVisibility } from "@/components/footer-visibility";
import { StoreChromeVisibility } from "@/components/store-chrome-visibility";
import { CartProvider } from "@/components/cart-provider";
import { LocaleProvider } from "@/components/locale-provider";
import { getI18n, getTheme } from "@/lib/i18n/server";
import { dirFor } from "@/lib/i18n/dictionary";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, t } = await getI18n();
  const ogLocale = locale === "ar" ? "ar_EG" : "en_US";
  return {
    applicationName: "E-Vora",
    title: {
      default: t.meta.title,
      template: "%s · E-Vora",
    },
    description: t.meta.description,
    openGraph: {
      type: "website",
      siteName: "E-Vora",
      title: t.meta.title,
      description: t.meta.description,
      locale: ogLocale,
    },
    twitter: {
      card: "summary",
      title: t.meta.title,
      description: t.meta.description,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [{ locale, t }, theme] = await Promise.all([getI18n(), getTheme()]);

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      data-theme={theme}
    >
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} bg-mesh min-h-screen antialiased flex flex-col`}
      >
        <LocaleProvider locale={locale} dict={t}>
          <CartProvider>
            <StoreChromeVisibility>
              <Header initialTheme={theme} />
              <FooterVisibility><Footer /></FooterVisibility>
            </StoreChromeVisibility>
            <main className="flex-1">{children}</main>
          </CartProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
