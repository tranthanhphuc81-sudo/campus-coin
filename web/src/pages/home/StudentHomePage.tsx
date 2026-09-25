import { useAuth } from "@/app/AuthProvider";
import { en } from "@/content/en";

export default function StudentHomePage() {
  const { user, signOut } = useAuth();

  return (
    <main style={{ margin: "0 auto", maxWidth: "48rem", padding: "2rem 1rem" }}>
      <h1>{en.auth.home.studentTitle}</h1>
      <p>{en.auth.home.studentSubtitle}</p>
      <p>{user?.fullName}</p>
      <button type="button" onClick={() => void signOut()}>
        {en.auth.home.signOutLabel}
      </button>
    </main>
  );
}
