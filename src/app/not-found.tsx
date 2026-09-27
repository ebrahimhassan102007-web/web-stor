import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6">
      <div className="glass-card card-glow-red p-12 text-center">
        <p className="font-mono text-6xl font-bold text-primary">404</p>
        <h1 className="mt-4 text-2xl font-bold">Access path not found</h1>
        <p className="mt-2 text-sm text-muted">
          The resource you requested does not exist or has been moved.
        </p>
        <Link href="/" className="btn-primary mt-8 px-8">
          Return to Base
        </Link>
      </div>
    </div>
  );
}
