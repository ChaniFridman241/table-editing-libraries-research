import { useCallback, useRef, useState } from 'react';

// מחסנית ביטול פשוטה. נשמרת ב-ref כדי שאפשר יהיה לקרוא ממנה מיד בתוך event handlers,
// וה-state משמש רק כדי לרנדר מחדש (למשל להפעיל/לכבות את כפתור "בטל").
export function useUndoStack(limit = 50) {
  const ref = useRef([]);
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);

  const push = useCallback((entry) => {
    ref.current = [...ref.current, entry].slice(-limit);
    rerender();
  }, [limit]);

  const pop = useCallback(() => {
    const entry = ref.current.at(-1);
    ref.current = ref.current.slice(0, -1);
    rerender();
    return entry;
  }, []);

  const clear = useCallback(() => {
    ref.current = [];
    rerender();
  }, []);

  // מאפשר לעדכן רשומות שנשארו במחסנית (למשל מספרי גרסה אחרי ביטול)
  const mapEntries = useCallback((fn) => {
    ref.current = ref.current.map(fn);
  }, []);

  return { size: ref.current.length, last: ref.current.at(-1), push, pop, clear, mapEntries };
}
