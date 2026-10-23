import type { Metadata } from "next";
import { InformationPage } from "@/components/information-page";
import { getI18n } from "@/lib/i18n/server";
import { staticPages } from "@/lib/i18n/static-pages";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  const page = staticPages[locale].deliveryRefunds;
  return { title: page.title, description: page.lead };
}

export default async function DeliveryRefundsPage() {
  const { locale } = await getI18n();
  return <InformationPage page={staticPages[locale].deliveryRefunds} />;
}
