import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
      <p className="text-7xl font-extrabold tracking-tight text-primary" aria-hidden>
        404
      </p>
      <h1 className="mt-4 text-2xl font-extrabold">الصفحة غير موجودة</h1>
      <p className="mt-2 text-sm text-muted">
        الرابط الذي تحاول الوصول إليه غير موجود أو تم نقله.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
        <Link href="/" className="btn-primary px-8">
          العودة للرئيسية
        </Link>
        <Link href="/products" className="btn-ghost px-8">
          تصفح الخدمات
        </Link>
      </div>
    </div>
  );
}
