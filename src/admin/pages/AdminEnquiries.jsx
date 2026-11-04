import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Mail,
  Phone,
  RefreshCw,
  Search,
  X,
  Inbox,
  AlertCircle,
  CheckCircle,
  Database,
  MailOpen,
  CheckCheck,
} from 'lucide-react';
import { getEnquiriesPage, updateEnquiryStatus } from '../../services/enquiries';

const PAGE_SIZE = 20;
const TABS = [
  { id: 'all', label: 'All Enquiries' },
  { id: 'unread', label: 'Unread' },
  { id: 'done', label: 'Read / Resolved' },
];
const STATUS_LABEL = { unread: 'Unread', read: 'Read', resolved: 'Resolved' };

const formatDate = (value) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return String(value);
  }
};

/*
 * Admin → Enquiries: messages from the Contact page (contact_enquiries, proposed migration 13).
 * Search, tabs and pages are answered by the database (one page at a time, with the count of
 * each tab). When the table does not exist the page says so instead of showing an empty list;
 * a connection or permission error is shown as an error, never as "no enquiries".
 */
export default function AdminEnquiries() {
  const [tab, setTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'read' | 'resolved' (Read / Resolved tab)
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ rows: [], total: 0, counts: { all: 0, unread: 0, done: 0 } });
  // 'loading' | 'ready' | 'not-set-up' | 'error'
  const [state, setState] = useState('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [notice, setNotice] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const requestRef = useRef(0);

  // Search is sent 350 ms after typing stops
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // A new tab, filter or search starts on the first page
  useEffect(() => {
    setPage(1);
  }, [tab, statusFilter, search]);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setState((s) => (s === 'ready' ? 'ready' : 'loading'));
    setErrorMsg('');
    try {
      const data = await getEnquiriesPage({
        tab,
        status: tab === 'done' ? statusFilter : '',
        search,
        page,
        pageSize: PAGE_SIZE,
      });
      if (request !== requestRef.current) return; // a newer request is on its way
      setResult(data);
      setState('ready');
    } catch (err) {
      if (request !== requestRef.current) return;
      if (err.code === 'ENQUIRIES_NOT_SET_UP') {
        setState('not-set-up');
      } else {
        setErrorMsg(err.message || 'Enquiries could not be loaded.');
        setState('error');
      }
    }
  }, [tab, statusFilter, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = async (enquiry, status, { quiet = false } = {}) => {
    if (enquiry.status === status) return;
    setBusyId(enquiry.id);
    if (!quiet) setNotice(null);
    try {
      await updateEnquiryStatus(enquiry.id, status);
      setSelected((cur) => (cur && cur.id === enquiry.id ? { ...cur, status } : cur));
      if (!quiet) setNotice({ type: 'success', text: `Enquiry from ${enquiry.name} marked ${STATUS_LABEL[status].toLowerCase()}.` });
      // Counts and the current tab may change: ask the database again
      load();
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setBusyId(null);
    }
  };

  const openEnquiry = (enquiry) => {
    setSelected(enquiry);
    // Opening an unread enquiry marks it read
    if (enquiry.status === 'unread') setStatus(enquiry, 'read', { quiet: true });
  };

  // Escape closes the details
  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => e.key === 'Escape' && setSelected(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selected]);

  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const countFor = { all: result.counts.all, unread: result.counts.unread, done: result.counts.done };

  return (
    <div className="ps-lx-page">
      <header className="ps-lx-header">
        <div>
          <span className="ps-lx-eyebrow">Customers</span>
          <h1 className="ps-lx-title">Enquiries</h1>
          <p className="ps-lx-subtitle">Messages sent from the Contact page. Open one to read it in full and reply.</p>
        </div>
        <div className="ps-lx-actions">
          <button type="button" className="ps-lx-btn ps-lx-btn--secondary" onClick={load} disabled={state === 'loading'}>
            <RefreshCw size={15} className={state === 'loading' ? 'ps-lx-spin' : ''} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {notice && (
        <div className={`ps-lx-alert ps-lx-alert--${notice.type}`} role={notice.type === 'error' ? 'alert' : 'status'}>
          {notice.type === 'error' ? <AlertCircle size={17} /> : <CheckCircle size={17} />}
          <div>{notice.text}</div>
        </div>
      )}

      {state === 'not-set-up' ? (
        <div className="ps-lx-card">
          <div className="ps-lx-empty">
            <Database size={32} aria-hidden="true" />
            <h3>Enquiry storage is not set up yet</h3>
            <p style={{ maxWidth: 560 }}>
              The database has no <code>contact_enquiries</code> table, so no messages can be stored or listed. The
              Contact page meanwhile shows your e-mail, Instagram and WhatsApp details instead of the form. The table
              is prepared in <code>supabase/new-project/proposed-13-admin-media-enquiries/</code> and is waiting for
              your review.
            </p>
            <button type="button" className="ps-lx-btn ps-lx-btn--secondary" onClick={load}>
              <RefreshCw size={15} aria-hidden="true" />
              <span>Check again</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="ps-lx-tabs" role="tablist" aria-label="Enquiry status">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`ps-lx-tab${tab === t.id ? ' is-active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <span>{t.label}</span>
                {state === 'ready' && <span className="ps-lx-count">{countFor[t.id]}</span>}
              </button>
            ))}
          </div>

          <div className="ps-lx-toolbar">
            <label className="ps-lx-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                className="ps-lx-input"
                placeholder="Search name, e-mail, phone, subject or message"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                aria-label="Search enquiries"
              />
            </label>
            {tab === 'done' && (
              <select
                className="ps-lx-select"
                style={{ width: 'auto' }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="">Read and resolved</option>
                <option value="read">Read only</option>
                <option value="resolved">Resolved only</option>
              </select>
            )}
          </div>

          {state === 'loading' ? (
            <div className="ps-lx-list" aria-busy="true">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="ps-lx-skeleton" />
              ))}
            </div>
          ) : state === 'error' ? (
            <div className="ps-lx-card">
              <div className="ps-lx-empty" role="alert">
                <AlertCircle size={30} aria-hidden="true" />
                <h3>Enquiries could not be loaded</h3>
                <p>{errorMsg}</p>
                <button type="button" className="ps-lx-btn" onClick={load}>
                  <RefreshCw size={15} aria-hidden="true" />
                  <span>Try again</span>
                </button>
              </div>
            </div>
          ) : result.rows.length === 0 ? (
            <div className="ps-lx-card">
              <div className="ps-lx-empty">
                <Inbox size={32} aria-hidden="true" />
                <h3>{search ? 'No enquiries match your search' : tab === 'unread' ? 'No unread enquiries' : 'No enquiries yet'}</h3>
                <p>{search ? 'Try another name, e-mail or word.' : 'New messages from the Contact page appear here.'}</p>
              </div>
            </div>
          ) : (
            <>
              <ul className="ps-lx-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {result.rows.map((enq) => (
                  <li key={enq.id} className="ps-lx-card ps-lx-row">
                    <span className="ps-lx-order" aria-hidden="true" style={{ fontSize: 14 }}>
                      {String(enq.name || '?').trim().charAt(0).toUpperCase()}
                    </span>
                    <button
                      type="button"
                      className="ps-lx-row-main"
                      onClick={() => openEnquiry(enq)}
                      style={{ background: 'none', border: 0, padding: 0, textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }}
                      aria-label={`Open enquiry from ${enq.name}`}
                    >
                      <div className="ps-lx-tags" style={{ marginTop: 0 }}>
                        <strong style={{ fontWeight: enq.status === 'unread' ? 700 : 600 }}>{enq.name}</strong>
                        <span className={`ps-lx-badge ps-lx-badge--${enq.status}`}>{STATUS_LABEL[enq.status] || enq.status}</span>
                        <span className="ps-lx-muted">{formatDate(enq.created_at)}</span>
                      </div>
                      <div style={{ marginTop: 4, fontFamily: 'var(--font-serif)', fontSize: 15 }}>
                        {enq.subject || 'No subject'}
                      </div>
                      <div className="ps-lx-muted" style={{ marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {enq.message}
                      </div>
                    </button>
                    <div className="ps-lx-row-actions">
                      {enq.status !== 'resolved' && (
                        <button
                          type="button"
                          className="ps-lx-btn ps-lx-btn--secondary ps-lx-btn--sm"
                          onClick={() => setStatus(enq, 'resolved')}
                          disabled={busyId === enq.id}
                        >
                          <CheckCheck size={14} aria-hidden="true" />
                          <span>Resolve</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="ps-lx-btn ps-lx-btn--ghost ps-lx-btn--sm"
                        onClick={() => setStatus(enq, enq.status === 'unread' ? 'read' : 'unread')}
                        disabled={busyId === enq.id}
                      >
                        {enq.status === 'unread' ? <MailOpen size={14} aria-hidden="true" /> : <Mail size={14} aria-hidden="true" />}
                        <span>{enq.status === 'unread' ? 'Mark read' : 'Mark unread'}</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {pageCount > 1 && (
                <nav className="ps-lx-pagination" aria-label="Enquiry pages">
                  <button type="button" className="ps-lx-btn ps-lx-btn--secondary ps-lx-btn--sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
                    Previous
                  </button>
                  <span>
                    Page {page} of {pageCount} · {result.total} enquiries
                  </span>
                  <button type="button" className="ps-lx-btn ps-lx-btn--secondary ps-lx-btn--sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pageCount}>
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
        </>
      )}

      {/* Full enquiry */}
      {selected && (
        <div className="ps-lx-overlay" onClick={() => setSelected(null)}>
          <div
            className="ps-lx-modal ps-lx-modal--narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ps-enq-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ps-lx-modal-head">
              <div>
                <span className={`ps-lx-badge ps-lx-badge--${selected.status}`}>{STATUS_LABEL[selected.status]}</span>
                <h2 id="ps-enq-title" className="ps-lx-card-title" style={{ marginTop: 8 }}>
                  {selected.subject || 'No subject'}
                </h2>
                <span className="ps-lx-muted">Received {formatDate(selected.created_at)}</span>
              </div>
              <button type="button" className="ps-lx-btn ps-lx-btn--ghost ps-lx-btn--icon" onClick={() => setSelected(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="ps-lx-modal-body">
              <div className="ps-lx-grid-2">
                <div className="ps-lx-field">
                  <span className="ps-lx-label">Name</span>
                  <span>{selected.name}</span>
                </div>
                <div className="ps-lx-field">
                  <span className="ps-lx-label">E-mail</span>
                  <a href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.subject || 'Your enquiry'}`)}`} style={{ color: 'var(--lux-green)', wordBreak: 'break-all' }}>
                    {selected.email}
                  </a>
                </div>
                {selected.phone && (
                  <div className="ps-lx-field">
                    <span className="ps-lx-label">Phone</span>
                    <a href={`tel:${String(selected.phone).replace(/[^\d+]/g, '')}`} style={{ color: 'var(--lux-green)' }}>
                      {selected.phone}
                    </a>
                  </div>
                )}
              </div>
              <div className="ps-lx-field">
                <span className="ps-lx-label">Message</span>
                <div className="ps-lx-card ps-lx-card-pad" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
                  {selected.message}
                </div>
              </div>
            </div>
            <div className="ps-lx-modal-foot">
              <a className="ps-lx-btn ps-lx-btn--secondary" href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.subject || 'Your enquiry'}`)}`}>
                <Mail size={15} aria-hidden="true" />
                <span>Reply by e-mail</span>
              </a>
              {selected.phone && (
                <a className="ps-lx-btn ps-lx-btn--secondary" href={`tel:${String(selected.phone).replace(/[^\d+]/g, '')}`}>
                  <Phone size={15} aria-hidden="true" />
                  <span>Call</span>
                </a>
              )}
              {selected.status !== 'unread' && (
                <button type="button" className="ps-lx-btn ps-lx-btn--ghost" onClick={() => setStatus(selected, 'unread')} disabled={busyId === selected.id}>
                  Mark unread
                </button>
              )}
              {selected.status === 'resolved' ? (
                <button type="button" className="ps-lx-btn ps-lx-btn--ghost" onClick={() => setStatus(selected, 'read')} disabled={busyId === selected.id}>
                  Reopen
                </button>
              ) : (
                <button type="button" className="ps-lx-btn" onClick={() => setStatus(selected, 'resolved')} disabled={busyId === selected.id}>
                  <CheckCheck size={15} aria-hidden="true" />
                  <span>Mark resolved</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
