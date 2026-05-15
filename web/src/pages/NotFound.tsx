import { Link } from "react-router-dom";
import useDocTitle from "../hooks/useDocTitle.ts";

export default function NotFound() {
  useDocTitle("Not Found");
  return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <h1 className="page-title">
        <span className="accent">404</span>
      </h1>
      <p className="page-subtitle">Page not found</p>
      <div className="card" style={{ display: "inline-block", padding: "28px 48px" }}>
        <p style={{ color: "var(--text2)", marginBottom: "20px", fontSize: "14px" }}>
          The page you are looking for does not exist or has been moved.
        </p>
        <Link to="/">Back to Home</Link>
      </div>
    </div>
  );
}
