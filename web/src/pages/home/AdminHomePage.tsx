import { useAuth } from "@/app/AuthProvider";
import { en } from "@/content/en";

export default function AdminHomePage() {
  const { user, signOut } = useAuth();

  return (
    <section className="panel" style={{ padding: "1.5rem" }}>
      <h1>{en.auth.home.adminTitle}</h1>
      <p>{en.auth.home.adminSubtitle}</p>
      <p>{user?.fullName}</p>
      <button type="button" className="btn btn-outline" onClick={() => void signOut()}>
        {en.auth.home.signOutLabel}
      </button>
    </section>
  );
}
