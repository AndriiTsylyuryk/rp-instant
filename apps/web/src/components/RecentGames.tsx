import { useCallback, useEffect, useState } from "react";
import type { FanGame } from "@rp/shared";
import { fetchMyGames } from "../api/account";

export function RecentGames() {
  const [items, setItems] = useState<FanGame[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const loadMore = useCallback(async () => {
    setBusy(true);
    setError(false);
    try {
      const res = await fetchMyGames(page + 1);
      setItems((prev) => [...prev, ...res.items]);
      setPage(res.page);
      setTotalPages(res.totalPages);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }, [page]);

  useEffect(() => {
    void loadMore();
  }, []);

  return (
    <div>
      <h2>Recent games</h2>
      {items.length === 0 && !busy && !error && <p>No games yet.</p>}
      <ul>
        {items.map((g) => (
          <li key={`${g.gameId}:${g.nickname}`}>
            <strong>{g.title}</strong>
            {g.playedAt && <> · {new Date(g.playedAt).toLocaleDateString()}</>}
            {" · "}
            {g.score} pts
            {g.rank !== null && g.players !== null && (
              <>
                {" · "}#{g.rank} of {g.players}
              </>
            )}
            {g.status !== "ended" && <> · {g.status}</>}
          </li>
        ))}
      </ul>
      {error && <p role="alert">Could not load games.</p>}
      {page < totalPages && (
        <button className="btn" disabled={busy} onClick={() => void loadMore()}>
          Load more
        </button>
      )}
    </div>
  );
}
