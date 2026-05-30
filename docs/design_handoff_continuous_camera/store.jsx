/* store.jsx — single source of truth + cross-device choreography.
   Reducer holds the real flow; scenario severity (saturation, low-R², connection
   loss) is layered on at render time from Tweaks so the happy path stays clean. */

const { createContext, useContext, useReducer, useEffect, useRef, useCallback } = React;

const STEPS = [
  { id: 'roi',     n: '3.1', short: 'Camera & ROI',  cap: 'framing'  },
  { id: 'calib',   n: '3.2', short: 'Calibration',   cap: 'lamp'     },
  { id: 'blank',   n: '3.3', short: 'Blank (I₀)',    cap: 'blank'    },
  { id: 'stds',    n: '3.4', short: 'Standards',     cap: 'standard' },
  { id: 'absorb',  n: '3.5', short: 'Absorbance',    cap: null       },
  { id: 'unknown', n: '3.6', short: 'Unknown',       cap: 'unknown'  },
  { id: 'results', n: '3.7', short: 'Results',       cap: null       },
];

const CAPTURE_META = {
  framing:  { title: 'Frame the strip', why: 'A still so you can lock the region every measurement shares.' },
  lamp:     { title: 'Capture the lamp', why: 'Its known emission lines tell us which pixel is which colour.' },
  blank:    { title: 'Capture the BLANK', why: 'Solvent-only — your 100%-light reference (I₀).' },
  standard: { title: 'Capture a STANDARD', why: 'A known concentration to anchor the calibration line.' },
  unknown:  { title: 'Capture your UNKNOWN', why: 'The sample whose concentration we want to find.' },
};

const JOIN_CODE = 'SPECTRO-4827';

function initState() {
  return {
    view: 'L0',                       // L0 | L1 | L2 | wizard
    sessions: [
      { id: 's-prior', name: 'Methylene blue — run 2', mode: 'beer_lambert',
        light: 'fluorescent', step: 3, date: '23 May', done: false },
    ],
    setup: { name: '', mode: 'beer_lambert', light: 'fluorescent' },
    activeName: '',
    step: 0,
    roi: null,                        // {x,y,w,h} normalised 0..1
    calib: null,                      // {done}
    blank: null,                      // {done}
    standards: [],                    // [{id, conc, done}]
    draftConc: '',
    lambdaMax: LMAX_TRUE,
    unknown: null,                    // {done, A, conc}
    phone: 'P0',                      // P0 | P1 | P2 | P3 (open-camera) | PCAM (live session)
    camOpen: false,                   // camera session opened (stays true the whole run)
    camLocked: false,                 // AE/AF/ISO locked once, held for every capture
    conn: 'offline',                  // offline | pairing | connected
    capture: null,                    // {type, conc, id, phase}
  };
}

function reducer(s, a) {
  switch (a.type) {
    case 'NEW_EXPERIMENT':
      return { ...initState(), sessions: s.sessions, view: 'L1' };
    case 'RESUME': {
      const ses = s.sessions.find(x => x.id === a.id);
      return { ...s, view: 'L2', setup: { name: ses.name, mode: ses.mode, light: ses.light }, activeName: ses.name };
    }
    case 'SET_SETUP':
      return { ...s, setup: { ...s.setup, ...a.patch } };
    case 'GO_PAIRING':
      return { ...s, view: 'L2', activeName: s.setup.name || 'Untitled experiment', conn: 'pairing', phone: 'P0' };
    case 'BACK_TO_SETUP':
      return { ...s, view: 'L1', conn: 'offline' };
    /* ── phone joins ── */
    case 'PHONE_SCAN':   return { ...s, phone: 'P1' };
    case 'PHONE_CANCEL_SCAN': return { ...s, phone: 'P0' };
    case 'CONNECT':      return { ...s, conn: 'connected', phone: 'P2', view: 'wizard', step: 0 };
    /* ── capture choreography ── */
    case 'REQUEST_CAPTURE':
      // If the camera session is already live, the overlay just updates in place —
      // no re-open, no re-lock. Only the very first capture needs the open-camera prompt.
      return { ...s, capture: { type: a.capType, conc: a.conc ?? null, id: a.id ?? null, phase: 'aim', progress: 0 }, phone: s.camOpen ? 'PCAM' : 'P3' };
    case 'PHONE_OPEN_CAMERA':
      // Opens the one continuous session. Stays open until the experiment ends.
      return { ...s, phone: 'PCAM', camOpen: true, capture: { ...s.capture, phase: 'aim' } };
    case 'PHONE_LOCK':
      // Locked once — held for every shot this session.
      return { ...s, camLocked: true };
    case 'PHONE_SHOOT':
      return { ...s, capture: { ...s.capture, phase: 'review' } };
    case 'PHONE_RETAKE':
      // Back to aiming WITHOUT dropping the lock — exposure stays held.
      return { ...s, capture: { ...s.capture, phase: 'aim' } };
    case 'PHONE_USE':
      return { ...s, capture: { ...s.capture, phase: 'uploading', progress: 0 } };
    case 'UPLOAD_PROGRESS':
      return s.capture ? { ...s, capture: { ...s.capture, progress: a.v } } : s;
    case 'UPLOAD_DONE':
      // Camera stays live (PCAM) while the laptop receives & analyses.
      return { ...s, phone: 'PCAM', capture: { ...s.capture, phase: 'receiving' } };
    case 'PROCESS_CAPTURE': {
      const c = s.capture; if (!c) return s;
      let patch = {};
      if (c.type === 'framing' && !s.roi) patch.roi = { x: 0.06, y: 0.34, w: 0.88, h: 0.30 };
      if (c.type === 'lamp')   patch.calib = { done: true };
      if (c.type === 'blank')  patch.blank = { done: true };
      if (c.type === 'standard') {
        patch.standards = s.standards.map(r => r.id === c.id ? { ...r, done: true } : r);
      }
      if (c.type === 'unknown') {
        const bl = beerLambert(s.standards.filter(r => r.done).map(r => r.conc), s.lambdaMax);
        const A = aAt(UNKNOWN_CONC, s.lambdaMax);
        patch.unknown = { done: true, A, conc: (A - bl.b) / bl.m };
      }
      return { ...s, ...patch, capture: { ...c, phase: 'done' } };
    }
    case 'CLEAR_CAPTURE':
      return { ...s, capture: null };
    /* ── step data ── */
    case 'SET_ROI':        return { ...s, roi: a.rect };
    case 'SET_LAMBDAMAX':  return { ...s, lambdaMax: a.v };
    case 'SET_DRAFT_CONC': return { ...s, draftConc: a.v };
    case 'ADD_STANDARD': {
      const id = a.id || ('std-' + Date.now());
      return { ...s, draftConc: '', standards: [...s.standards, { id, conc: a.conc, done: false }] };
    }
    case 'DELETE_STANDARD':
      return { ...s, standards: s.standards.filter(r => r.id !== a.id) };
    /* ── nav ── */
    case 'NEXT':  return { ...s, step: Math.min(STEPS.length - 1, s.step + 1) };
    case 'BACK':  return { ...s, step: Math.max(0, s.step - 1) };
    case 'GOTO':  return { ...s, step: a.i };
    case 'GO_SESSIONS': return { ...s, view: 'L0' };
    case 'RESET': return initState();
    default: return s;
  }
}

const Ctx = createContext(null);
const useStore = () => useContext(Ctx);

function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const ref = useRef(); ref.current = state;

  // upload progress animation
  useEffect(() => {
    if (state.capture?.phase !== 'uploading') return;
    let v = 0;
    const t = setInterval(() => {
      v += 6 + Math.random() * 12;
      if (v >= 100) { v = 100; clearInterval(t); dispatch({ type: 'UPLOAD_PROGRESS', v: 100 }); setTimeout(() => dispatch({ type: 'UPLOAD_DONE' }), 320); }
      else dispatch({ type: 'UPLOAD_PROGRESS', v: Math.round(v) });
    }, 130);
    return () => clearInterval(t);
  }, [state.capture?.phase]);

  // laptop "receiving / analysing" -> process -> clear
  useEffect(() => {
    if (state.capture?.phase !== 'receiving') return;
    const t = setTimeout(() => dispatch({ type: 'PROCESS_CAPTURE' }), 1500);
    return () => clearTimeout(t);
  }, [state.capture?.phase]);

  useEffect(() => {
    if (state.capture?.phase !== 'done') return;
    const t = setTimeout(() => dispatch({ type: 'CLEAR_CAPTURE' }), 1600);
    return () => clearTimeout(t);
  }, [state.capture?.phase]);

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

Object.assign(window, { STEPS, CAPTURE_META, JOIN_CODE, StoreProvider, useStore });
