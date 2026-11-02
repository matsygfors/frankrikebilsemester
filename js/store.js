// Tiny shared state: trip time, playback, map framing. Subscribers get (state, patch).

export function createStore(initial) {
  let state = { ...initial };
  const subscribers = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of subscribers) fn(state, patch);
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
