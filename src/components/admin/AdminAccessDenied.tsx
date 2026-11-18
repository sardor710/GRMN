import Link from "next/link";

export function AdminAccessDenied({ message }: { message: string }) {
  return <section className="mx-auto max-w-xl border border-neutral-300 bg-white p-8 text-black">
    <h1 className="text-xl font-semibold">Administrator access</h1>
    <p className="mt-3 text-neutral-700">{message}</p>
    <Link className="mt-5 inline-block underline" href="/admin/login">Sign in or verify MFA again</Link>
  </section>;
}
