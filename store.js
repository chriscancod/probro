// Local-first store. All persistence goes through here so a sync backend
// can be added later without touching the UI (swap load/save, keep the shape).
const Store = (() => {
  const KEY = 'probro.v2';
  const defaults = () => ({
    version: 2,
    updatedAt: 0,
    settings: { easeInMin: 10, extendMin: 15, breakMin: 5 },
    islands: {
      School: { strict: 'soft', sites: ['notion.so', 'docs.google.com', 'khanacademy.org', 'wikipedia.org'] },
      Work:   { strict: 'soft', sites: ['github.com', 'notion.so', 'docs.google.com'] },
      Break:  { strict: 'off',  sites: ['youtube.com', 'reddit.com'] }
    },
    tabs: { School: [], Work: [], Break: [] },
    activeTab: {},
    tasks: [],        // { id, island, text, done }
    currentTaskId: null,
    dump: [],         // { id, text, at }
    stats: {}         // 'YYYY-MM-DD' -> { focusSec, blocked, overrides }
  });

  let data;
  try {
    data = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY)) || {});
  } catch (_) {
    data = defaults();
  }

  const save = () => {
    data.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {}
  };
  const today = () => new Date().toLocaleDateString('en-CA');
  const dayStats = () => (data.stats[today()] ||= { focusSec: 0, blocked: 0, overrides: 0 });
  const uid = () => Math.random().toString(36).slice(2, 10);

  return { get data() { return data; }, save, dayStats, uid };
})();
