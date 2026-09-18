import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useStore } from "../store";
import { fallbackSearch, searchWorld } from "../api";
import { bridge } from "../game/bridge";
import { visualFor } from "../worldgen";
import type { SearchResult, WorldEntity } from "../types";

const DEBOUNCE_MS = 180;
const MAX_RESULTS = 12;

function iconFor(e: WorldEntity): string {
  if (e.kind === "folder") return "▣";
  switch (visualFor(e.extension)) {
    case "book-red":
    case "book-parchment":
      return "▤";
    case "artwork":
      return "▦";
    case "screen":
      return "▶";
    case "record":
      return "♫";
    case "crate":
      return "▩";
    case "terminal":
      return "⌨";
    default:
      return "◆";
  }
}

function mergeResults(api: SearchResult[], fallback: SearchResult[]): SearchResult[] {
  const seen = new Set(api.map((r) => r.path));
  const merged = [...api];
  for (const r of fallback) {
    if (!seen.has(r.path)) {
      merged.push(r);
      seen.add(r.path);
    }
  }
  return merged;
}

export default function SearchOverlay() {
  const searchOpen = useStore((s) => s.searchOpen);
  const source = useStore((s) => s.source);
  const entities = useStore((s) => s.entities);
  const player = useStore((s) => s.player);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const latestQuery = useRef("");

  useEffect(() => {
    if (!searchOpen) return;
    setQuery("");
    setResults([]);
    setSelectedIndex(0);
    setLoading(false);
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    // instant local results over whatever world is loaded (live or demo)
    const local = fallbackSearch(entities, query);
    setResults(local.slice(0, MAX_RESULTS));
    setSelectedIndex(0);
    if (source === "demo") {
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      const q = query;
      latestQuery.current = q;
      (async () => {
        let apiResults: SearchResult[] = [];
        try {
          apiResults = await searchWorld(q);
        } catch {
          apiResults = [];
        }
        if (latestQuery.current !== q) return;
        const finalResults = mergeResults(apiResults, fallbackSearch(entities, q));
        setResults(finalResults.slice(0, MAX_RESULTS));
        setSelectedIndex(0);
        setLoading(false);
      })();
    }, DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, searchOpen, source, entities]);

  if (!searchOpen) return null;

  const close = () => {
    useStore.getState().setSearchOpen(false);
    bridge.requestLock();
  };

  const selectEntity = (entity: SearchResult) => {
    const layout = bridge.layout;
    let id = entity.id;
    if (layout && !layout.byId.has(id)) {
      const match = [...layout.byId.values()].find((e) => e.path === entity.path);
      if (match) id = match.id;
    }
    const position = bridge.locate(entity);
    useStore.getState().setWaypoint({ id, name: entity.name, kind: entity.kind, position });
    useStore.getState().toast(`WAYPOINT SET → ${entity.name}`, "info");
    useStore.getState().setSearchOpen(false);
    bridge.requestLock();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entity = results[selectedIndex];
      if (entity) selectEntity(entity);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  let body: ReactNode;
  if (loading && results.length === 0) {
    body = <div className="search-empty">SEARCHING…</div>;
  } else if (!query.trim()) {
    body = <div className="search-empty">Type to search your real files</div>;
  } else if (results.length === 0) {
    body = <div className="search-empty">NO MATCHES</div>;
  } else {
    body = (
      <ul className="search-results">
        {results.map((r, i) => {
          const pos = bridge.locate(r);
          const dist = Math.hypot(player.x - pos[0], player.z - pos[2]);
          return (
            <li
              key={r.id}
              className={`search-row${i === selectedIndex ? " selected" : ""}`}
              onMouseEnter={() => setSelectedIndex(i)}
              onClick={() => selectEntity(r)}
            >
              <span className="search-icon">{iconFor(r)}</span>
              <div className="search-main">
                <span className="search-name">{r.name}</span>
                <span className="search-path">{r.path}</span>
              </div>
              <span className="search-badge">{r.kind === "folder" ? "FOLDER" : (r.extension ?? "FILE").toUpperCase()}</span>
              <span className="search-dist">{dist.toFixed(0)}m</span>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="search fade-in">
      <div className="search-backdrop" onClick={close} />
      <div className="search-panel">
        <input
          ref={inputRef}
          className="search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search your real files…"
          spellCheck={false}
          autoComplete="off"
        />
        {body}
        <div className="search-footer">↑↓ NAVIGATE • ENTER WARP-MARK • ESC CLOSE</div>
      </div>
    </div>
  );
}
