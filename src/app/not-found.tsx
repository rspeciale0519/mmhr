import Link from "next/link";

export default function NotFound() {
  return (
    <main className="co-w">
      <div className="co-gl co-auth-card">
        <h1 className="co-pt" style={{ fontSize: 44 }}>Page not found</h1>
        <p className="co-ps">The requested page is not available.</p>
        <Link className="co-btn co-btn-p" href="/" style={{ marginTop: 24 }}>
          Return to the home page
        </Link>
      </div>
    </main>
  );
}
