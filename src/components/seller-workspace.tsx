"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { csrfFetch } from "@/lib/security/csrf-client";
import { useI18n } from "@/components/locale-provider";
import { formatCount } from "@/lib/seller-format";

export type SellerProductView = {
  id: number;
  name: string;
  priceCents: number;
  stock: number;
  isActive: boolean;
};

export type SellerCategoryView = { id: number; name: string };

type ApiBody = { ok?: boolean; error?: string; data?: Record<string, unknown> };

/**
 * Merchant workspace (S-26): create draft listings, import fulfillment codes
 * and publish/unpublish. Every call is refused with `403` by the server until
 * the merchant gate is complete, so the UI is convenience — never the control.
 */
export function SellerWorkspace({
  products,
  categories,
  canPublish,
}: {
  products: SellerProductView[];
  categories: SellerCategoryView[];
  canPublish: boolean;
}) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState(String(categories[0]?.id ?? ""));
  const [inputType, setInputType] = useState("none");

  const [stockTarget, setStockTarget] = useState(String(products[0]?.id ?? ""));
  const [codes, setCodes] = useState("");

  function fail(code: string | undefined) {
    setError(
      code === "SELLER_GATES_INCOMPLETE"
        ? t.seller.errors.gates
        : code === "RATE_LIMITED"
          ? t.seller.errors.rateLimited
          : t.seller.errors.generic,
    );
  }

  async function createProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("create");
    setError("");
    setNotice("");
    const cents = Math.round(Number(price) * 100);
    try {
      const response = await csrfFetch("/api/seller/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          nameAr,
          description,
          priceCents: cents,
          categoryId: Number(categoryId),
          inputType,
        }),
      });
      const body = (await response.json().catch(() => null)) as ApiBody | null;
      if (!response.ok || !body?.ok) {
        fail(body?.error);
        setBusy("");
        return;
      }
      setNotice(t.seller.errors.productCreated);
      setName("");
      setNameAr("");
      setDescription("");
      setPrice("");
      router.refresh();
    } catch {
      fail(undefined);
    }
    setBusy("");
  }

  async function importStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("stock");
    setError("");
    setNotice("");
    try {
      const response = await csrfFetch(`/api/seller/products/${encodeURIComponent(stockTarget)}/stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: codes }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        data?: { imported?: number; duplicates?: number };
      } | null;
      if (!response.ok || !body?.ok) {
        fail(body?.error);
        setBusy("");
        return;
      }
      setNotice(
        t.seller.errors.imported
          .replace("{imported}", formatCount(body.data?.imported ?? 0, locale))
          .replace("{duplicates}", formatCount(body.data?.duplicates ?? 0, locale)),
      );
      setCodes("");
      router.refresh();
    } catch {
      fail(undefined);
    }
    setBusy("");
  }

  async function toggle(product: SellerProductView) {
    if (busy) return;
    setBusy(`toggle-${product.id}`);
    setError("");
    setNotice("");
    try {
      const response = await csrfFetch(`/api/seller/products/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !product.isActive }),
      });
      const body = (await response.json().catch(() => null)) as ApiBody | null;
      if (!response.ok || !body?.ok) fail(body?.error);
      else router.refresh();
    } catch {
      fail(undefined);
    }
    setBusy("");
  }

  return (
    <div className="mt-6 space-y-6">
      {error && (
        <p role="alert" className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {notice}
        </p>
      )}

      <section className="glass-card p-5 sm:p-6">
        <h2 className="text-lg font-bold">{t.seller.productsTitle}</h2>
        {products.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t.seller.noProducts}</p>
        ) : (
          <ul className="mt-4 divide-y divide-edge">
            {products.map((product) => (
              <li key={product.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="text-sm">
                  {product.name}
                  <span className="ms-2 text-xs text-muted">
                    {formatCount(product.stock, locale)} · {product.isActive ? "live" : "draft"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => toggle(product)}
                  disabled={busy === `toggle-${product.id}` || (!canPublish && !product.isActive)}
                  className="btn-ghost px-3 py-2 text-xs"
                >
                  {product.isActive ? t.seller.unpublish : t.seller.publish}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card p-5 sm:p-6">
        <h2 className="text-lg font-bold">{t.seller.newProductTitle}</h2>
        <form onSubmit={createProduct} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
          <div>
            <label htmlFor="seller-product-name" className="mb-1.5 block text-sm font-medium">
              {t.seller.productName}
            </label>
            <input id="seller-product-name" required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="input-dark" />
          </div>
          <div>
            <label htmlFor="seller-product-name-ar" className="mb-1.5 block text-sm font-medium">
              {t.seller.productNameAr}
            </label>
            <input id="seller-product-name-ar" maxLength={120} value={nameAr} onChange={(event) => setNameAr(event.target.value)} className="input-dark" dir="rtl" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="seller-product-description" className="mb-1.5 block text-sm font-medium">
              {t.seller.productDescription}
            </label>
            <textarea id="seller-product-description" required minLength={10} maxLength={4000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="input-dark" />
          </div>
          <div>
            <label htmlFor="seller-product-price" className="mb-1.5 block text-sm font-medium">
              {t.seller.price}
            </label>
            <input id="seller-product-price" type="number" min="0.01" step="0.01" required value={price} onChange={(event) => setPrice(event.target.value)} dir="ltr" className="input-dark" />
            <p className="mt-1.5 text-xs text-muted">{t.seller.priceHint}</p>
          </div>
          <div>
            <label htmlFor="seller-product-category" className="mb-1.5 block text-sm font-medium">
              {t.seller.category}
            </label>
            <select id="seller-product-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="input-dark">
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="seller-product-input-type" className="mb-1.5 block text-sm font-medium">
              {t.seller.fulfillmentType}
            </label>
            <select id="seller-product-input-type" value={inputType} onChange={(event) => setInputType(event.target.value)} className="input-dark">
              <option value="none">none</option>
              <option value="player-id">player-id</option>
              <option value="region">region</option>
              <option value="activation-email">activation-email</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy === "create"} className="btn-primary px-5 py-3 text-sm">
              {busy === "create" ? t.seller.creating : t.seller.createProduct}
            </button>
          </div>
        </form>
      </section>

      <section className="glass-card p-5 sm:p-6">
        <h2 className="text-lg font-bold">{t.seller.stockTitle}</h2>
        <p className="mt-2 text-sm text-muted">{t.seller.stockHint}</p>
        <form onSubmit={importStock} className="mt-4 space-y-4" noValidate>
          <div>
            <label htmlFor="seller-stock-product" className="mb-1.5 block text-sm font-medium">
              {t.seller.productsTitle}
            </label>
            <select id="seller-stock-product" value={stockTarget} onChange={(event) => setStockTarget(event.target.value)} className="input-dark">
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="seller-stock-codes" className="mb-1.5 block text-sm font-medium">
              {t.seller.stockTitle}
            </label>
            <textarea
              id="seller-stock-codes"
              rows={5}
              value={codes}
              onChange={(event) => setCodes(event.target.value)}
              dir="ltr"
              className="input-dark font-mono text-xs"
            />
          </div>
          <button
            type="submit"
            disabled={busy === "stock" || !stockTarget || !codes.trim()}
            className="btn-primary px-5 py-3 text-sm"
          >
            {busy === "stock" ? t.seller.importing : t.seller.importCodes}
          </button>
        </form>
      </section>
    </div>
  );
}
