import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { columnDefs, defaultColDef } from '../columns.jsx';
import { useUndoStack } from '../useUndoStack.js';
import Toast from '../components/Toast.jsx';

const rowSelection = { mode: 'multiRow' };
const getRowId = (p) => p.data._key;
const localeText = { noRowsToShow: 'אין עובדים להצגה', loadingOoo: 'טוען...' };

// שמירה: כל שינוי נשמר מיד ב-DB, ברקע (אסינכרוני), עם עדכון אופטימי:
// הטבלה מציגה את השינוי מיד, ואם השמירה נכשלת השינוי חוזר אחורה (rollback).
// AG Grid אחראית על התצוגה והעריכה, TanStack Query אחראית על הסנכרון מול השרת.
export default function EmployeesPage() {
  const qc = useQueryClient();
  const gridRef = useRef(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState({ sortField: 'id', sortDir: 'desc' });
  const [editing, setEditing] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [toast, setToast] = useState(null);
  const undo = useUndoStack();

  // הגרסה האחרונה שידועה לנו לכל שורה - נשלחת לשרת לזיהוי התנגשויות
  const versions = useRef(new Map());
  const trackVersion = (row) => {
    if (row && (versions.current.get(row.id) ?? 0) < row.version) versions.current.set(row.id, row.version);
  };

  // תור: בקשות לשרת יוצאות אחת אחרי השנייה, כדי ששתי עריכות מהירות באותה שורה לא יתנגשו זו בזו
  const queue = useRef(Promise.resolve());
  const enqueue = (fn) => {
    const p = queue.current.then(fn);
    queue.current = p.catch(() => {});
    return p;
  };

  const showToast = (type, text) => setToast({ type, text, at: Date.now() });

  // חיפוש עם השהייה קצרה כדי לא לשלוח בקשה על כל הקשה
  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchInput.trim();
      if (next !== search) {
        setSearch(next);
        setPage(1);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput, search]);

  const params = { page, pageSize, search, ...sort };
  const { data, isLoading, isFetching, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['employees', params],
    queryFn: () => api.listEmployees(params),
    placeholderData: keepPreviousData,
    // ריענון אוטומטי כל 10 שניות כדי לראות שינויים של משתמשות אחרות
    refetchInterval: editing ? false : 10_000,
  });

  useEffect(() => {
    data?.rows.forEach(trackVersion);
  }, [data]);

  // שורות חדשות שעוד לא נשמרו: מוצגות רק על המסך, ונשמרות ב-DB רק כשממלאים בהן ערך ראשון.
  // שורה שנשארה ריקה לא נשמרת, ונעלמת ברענון.
  const [newRows, setNewRows] = useState([]);
  const tempCounter = useRef(0);
  const pendingCreates = useRef(new Map()); // מזהה זמני -> הבטחה לשורה שנוצרה בשרת
  // אחרי שמירה, השורה ממשיכה להשתמש במפתח הזמני, כדי שהטבלה תתייחס אליה כאותה שורה ולא תקטע עריכה
  const keyForId = useRef(new Map());

  // עותקים, כי AG Grid משנה את אובייקט השורה בזמן עריכה
  const rows = useMemo(() => [
    ...newRows,
    ...(data?.rows ?? []).map((r) => ({ ...r, _key: keyForId.current.get(r.id) ?? String(r.id) })),
  ], [data, newRows]);

  const replaceRowInCache = (row) =>
    qc.setQueriesData({ queryKey: ['employees'] }, (old) =>
      old && { ...old, rows: old.rows.map((r) => (r.id === row.id ? row : r)) });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['employees'] });

  // עדכון תא: TanStack Query useMutation עם עדכון אופטימי
  const updateCell = useMutation({
    mutationFn: ({ id, field, newValue }) =>
      enqueue(async () => {
        const before = versions.current.get(id);
        const row = await api.updateEmployee(id, before, { [field]: newValue });
        return { row, before };
      }),
    onSuccess: ({ row, before }, { field, oldValue }) => {
      trackVersion(row);
      replaceRowInCache(row);
      undo.push({
        label: 'עריכת תא',
        ops: [{ type: 'update', id: row.id, field, oldValue, before, after: row.version }],
      });
    },
    onError: (err, { node, field, oldValue }) => {
      // rollback: מציגים את הערך העדכני מהשרת (אם יש) או את הערך הקודם
      const current = err.body?.current;
      if (current) {
        trackVersion(current);
        node.setData(current);
      } else {
        node.setData({ ...node.data, [field]: oldValue });
      }
      showToast('error', err.message);
    },
    onSettled: invalidate,
  });

  const onCellValueChanged = (e) => {
    const change = { field: e.colDef.field, newValue: e.newValue, oldValue: e.oldValue, node: e.node };
    if (e.data.id < 0) saveNewRow(e.data, change);
    else updateCell.mutate({ id: e.data.id, ...change });
  };

  // הערך הראשון שממלאים בשורה חדשה יוצר אותה ב-DB. ערכים נוספים הם עדכונים רגילים.
  const saveNewRow = (tempRow, change) => {
    const pending = pendingCreates.current.get(tempRow.id);
    if (pending) {
      pending.then((row) => updateCell.mutate({ id: row.id, ...change }));
      return;
    }
    if (change.newValue == null || String(change.newValue).trim() === '') return;

    const queryKey = ['employees', params];
    const p = enqueue(() => api.createEmployee({ [change.field]: change.newValue }));
    pendingCreates.current.set(tempRow.id, p);
    p.then(
      (row) => {
        trackVersion(row);
        keyForId.current.set(row.id, tempRow._key);
        // מכניסים את השורה השמורה במקום הזמנית, עם מה שכבר הוקלד בה
        const typed = Object.fromEntries(
          Object.entries(tempRow).filter(([k, v]) => k !== 'id' && k !== '_key' && v != null && v !== '')
        );
        const shown = { ...row, ...typed };
        qc.setQueryData(queryKey, (old) => old && { ...old, total: old.total + 1, rows: [shown, ...old.rows] });
        setNewRows((list) => list.filter((r) => r.id !== tempRow.id));
        undo.push({ label: 'הוספת שורה', ops: [{ type: 'create', id: row.id, before: null, after: row.version }] });
        invalidate();
      },
      (err) => {
        pendingCreates.current.delete(tempRow.id);
        showToast('error', err.message);
      }
    );
  };

  const addRow = () => {
    const n = ++tempCounter.current;
    setNewRows((list) => [
      { id: -n, _key: `tmp-${n}`, first_name: '', last_name: '', email: '', department: '', position: '', salary: null, start_date: null },
      ...list,
    ]);
    // פותחים מיד את התא הראשון לעריכה
    setTimeout(() => gridRef.current?.api.startEditingCell({ rowIndex: 0, colKey: 'first_name' }), 50);
    showToast('info', 'השורה תישמר ברגע שתמלאי בה ערך כלשהו');
  };

  const deleteSelected = async () => {
    const all = gridRef.current.api.getSelectedRows();
    if (!all.length) return showToast('info', 'יש לסמן שורות למחיקה');

    // שורות חדשות שעוד לא נשמרו - פשוט מורידים מהמסך
    const unsaved = all.filter((r) => r.id < 0 && !pendingCreates.current.has(r.id)).map((r) => r.id);
    if (unsaved.length) setNewRows((list) => list.filter((r) => !unsaved.includes(r.id)));
    const selected = all.filter((r) => r.id > 0);
    if (!selected.length) return;
    if (!window.confirm(`למחוק ${selected.length} עובדים?`)) return;

    const ops = [];
    try {
      for (const r of selected) {
        const before = versions.current.get(r.id);
        const row = await enqueue(() => api.deleteEmployee(r.id, before));
        trackVersion(row);
        ops.push({ type: 'delete', id: r.id, before, after: row.version });
      }
    } catch (err) {
      showToast('error', err.message);
    }
    if (ops.length) undo.push({ label: `מחיקת ${ops.length} שורות`, ops });
    invalidate();
  };

  // ביטול הפעולה האחרונה.
  // הנתונים כבר נשמרו ב-DB, לכן שולחים לשרת את הפעולה ההפוכה ("פעולה מפצה").
  // אם מישהי אחרת שינתה את השורה בינתיים, השרת מחזיר התנגשות והביטול לא מתבצע.
  const runUndo = async () => {
    const entry = undo.last;
    if (!entry || undoing) return;
    gridRef.current?.api.stopEditing(true);
    undo.pop();

    setUndoing(true);
    try {
      for (const op of [...entry.ops].reverse()) {
        let row;
        if (op.type === 'update') row = await enqueue(() => api.updateEmployee(op.id, op.after, { [op.field]: op.oldValue }));
        else if (op.type === 'create') row = await enqueue(() => api.deleteEmployee(op.id, op.after));
        else row = await enqueue(() => api.restoreEmployee(op.id, op.after));
        trackVersion(row);
        // השורה חזרה למצב של op.before, אבל עם מספר גרסה חדש - מעדכנים את שאר המחסנית
        undo.mapEntries((e) => ({
          ...e,
          ops: e.ops.map((o) => (o.id === op.id && o.after === op.before ? { ...o, after: row.version } : o)),
        }));
      }
      showToast('success', `בוטל: ${entry.label}`);
    } catch (err) {
      showToast('error', `לא ניתן לבטל. ${err.message}`);
    } finally {
      setUndoing(false);
      invalidate();
    }
  };

  // ---------- תצוגת עמודות (סדר ורוחב) - נשמרת בשרת לכל משתמשת ----------
  // AG Grid נותנת את מצב העמודות (getColumnState) ויודעת להחיל אותו (applyColumnState).
  const [gridReady, setGridReady] = useState(false);
  const gridSettings = useQuery({ queryKey: ['gridSettings'], queryFn: api.getGridSettings, staleTime: Infinity });
  const saveColumns = useMutation({
    mutationFn: api.saveGridSettings,
    onSuccess: (data) => qc.setQueryData(['gridSettings'], data),
    onError: () => showToast('error', 'שמירת תצוגת העמודות נכשלה'),
  });

  useEffect(() => {
    const columns = gridSettings.data?.columns;
    if (gridReady && columns) gridRef.current.api.applyColumnState({ state: columns, applyOrder: true });
  }, [gridReady, gridSettings.data]);

  // נקרא כשמסיימים לגרור או למתוח עמודה. המיון לא נשמר כאן - הוא נשמר בנפרד בשרת.
  const saveColumnLayout = () => {
    const columns = gridRef.current.api.getColumnState()
      .map(({ colId, width, flex, hide, pinned }) => ({ colId, width, flex, hide, pinned }));
    saveColumns.mutate(columns);
  };

  const resetColumnLayout = () => {
    gridRef.current.api.resetColumnState();
    saveColumns.mutate(null);
  };

  const onSortChanged = (e) => {
    const col = e.api.getColumnState().find((c) => c.sort);
    setSort(col ? { sortField: col.colId, sortDir: col.sort } : { sortField: 'id', sortDir: 'desc' });
    setPage(1);
  };

  // הגריד מקבל פונקציות יציבות שקוראות לגרסה העדכנית של ה-handlers
  const latest = useRef();
  latest.current = { onCellValueChanged, onSortChanged, runUndo, saveColumnLayout };
  const gridHandlers = useMemo(() => ({
    onGridReady: () => setGridReady(true),
    onCellValueChanged: (e) => latest.current.onCellValueChanged(e),
    onSortChanged: (e) => latest.current.onSortChanged(e),
    onDragStopped: () => latest.current.saveColumnLayout(),
    onCellEditingStarted: () => setEditing(true),
    onCellEditingStopped: () => setEditing(false),
  }), []);

  // Ctrl+Z לביטול (לפי מיקום המקש, כך שעובד גם במקלדת בעברית)
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.code !== 'KeyZ' || e.shiftKey) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (gridRef.current?.api.getEditingCells().length) return;
      e.preventDefault();
      latest.current.runUndo();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="page">
      <div className="page-header">
        <h1>עובדים</h1>
      </div>

      <p className="hint">
        כל שינוי נשמר מיד. לחיצה כפולה על תא לעריכה, Ctrl+Z לביטול הפעולה האחרונה.
        אפשר לגרור עמודות ולשנות את רוחבן – התצוגה נשמרת לכל משתמשת.
      </p>

      <div className="toolbar">
        <button onClick={addRow}>＋ הוספת שורה</button>
        <button onClick={deleteSelected}>🗑 מחיקת מסומנות</button>
        <button onClick={runUndo} disabled={!undo.size || undoing} title={undo.last?.label ?? ''}>
          ↶ ביטול פעולה אחרונה
        </button>
        <button onClick={() => refetch()} disabled={isFetching}>⟳ רענון</button>
        <button onClick={resetColumnLayout} title="החזרת סדר ורוחב העמודות למצב ההתחלתי">⇆ איפוס עמודות</button>
        <input
          className="search"
          placeholder="חיפוש..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <span className="status">
          {isFetching ? 'טוען...' : dataUpdatedAt ? `עודכן ${new Date(dataUpdatedAt).toLocaleTimeString('he-IL')}` : ''}
        </span>
      </div>

      {isError && <div className="error-box">שגיאה בטעינת הנתונים: {error.message}</div>}

      <AgGridReact
        ref={gridRef}
        enableRtl
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        getRowId={getRowId}
        rowSelection={rowSelection}
        domLayout="autoHeight"
        loading={isLoading}
        localeText={localeText}
        stopEditingWhenCellsLoseFocus
        {...gridHandlers}
      />

      <div className="pager">
        <button onClick={() => setPage(1)} disabled={page <= 1}>» ראשון</button>
        <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>› הקודם</button>
        <span>עמוד {page} מתוך {totalPages} ({total} עובדים)</span>
        <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>הבא ‹</button>
        <button onClick={() => setPage(totalPages)} disabled={page >= totalPages}>אחרון «</button>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
          {[10, 20, 50].map((n) => <option key={n} value={n}>{n} בעמוד</option>)}
        </select>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
