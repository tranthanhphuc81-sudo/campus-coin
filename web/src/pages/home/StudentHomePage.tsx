import { useAuth } from "@/app/AuthProvider";
import { en } from "@/content/en";

export default function StudentHomePage() {
  const { user, signOut } = useAuth();

  return (
    <section className="panel" style={{ padding: "1.5rem" }}>
      <h1>{en.auth.home.studentTitle}</h1>
      <p>{en.auth.home.studentSubtitle}</p>
      <p>{user?.fullName}</p>
      <button type="button" className="btn btn-outline" onClick={() => void signOut()}>
        {en.auth.home.signOutLabel}
      </button>
    </section>
  );
}
