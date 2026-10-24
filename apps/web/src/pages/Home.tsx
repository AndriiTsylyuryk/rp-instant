import { useEffect, useState } from "react";

export default function Home() {
  const [now, setNow] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/time")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setNow(d.now))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div>
      <h1>RoundPicks</h1>
      {error ? (
        <p>Error: {error}</p>
      ) : (
        <p>
          Server time: {now ? new Date(now).toLocaleTimeString() : "loading..."}
        </p>
      )}
    </div>
  );
}
