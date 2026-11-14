// Path helpers. A path is an array of [lat, lng]. Routes in the data are schematic
// straight lines between rough place anchors, so a position is interpolated by length.

const EARTH_KM = 6371;
const rad = (deg) => (deg * Math.PI) / 180;

export function distanceKm([lat1, lon1], [lat2, lon2]) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

/** cum[i] is the distance in km from the start of the path to point i. */
export function cumulative(path) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + distanceKm(path[i - 1], path[i]));
  return cum;
}

/** The part of a path from its start up to fraction f (0–1) of its length. */
export function partial(path, cum, f) {
  const total = cum.at(-1);
  if (f <= 0 || total === 0) return [path[0]];
  if (f >= 1) return path;
  const target = total * f;
  let i = 1;
  while (cum[i] < target) i++;
  const k = (target - cum[i - 1]) / (cum[i] - cum[i - 1]);
  const [a, b] = [path[i - 1], path[i]];
  return [...path.slice(0, i), [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]];
}

export const pointAt = (path, cum, f) => partial(path, cum, f).at(-1);

/** Distance in km from a [lat, lng] point to a path of [lat, lng] points, on a flat map around the point. */
export function distanceToPathKm([lat, lng], path) {
  const kx = 111.32 * Math.cos(rad(lat));
  const ky = 110.57;
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const [x1, y1] = [(path[i][1] - lng) * kx, (path[i][0] - lat) * ky];
    const [x2, y2] = [(path[i + 1][1] - lng) * kx, (path[i + 1][0] - lat) * ky];
    const [dx, dy] = [x2 - x1, y2 - y1];
    const t = dx || dy ? Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / (dx * dx + dy * dy))) : 0;
    best = Math.min(best, Math.hypot(x1 + t * dx, y1 + t * dy));
  }
  return best;
}
