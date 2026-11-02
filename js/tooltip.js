// One floating tooltip shared by everything that carries a data-tip attribute (HTML, built by js/text.js).

const tip = document.createElement('div');
tip.className = 'tip';
tip.setAttribute('role', 'tooltip');
tip.hidden = true;
document.body.append(tip);

const hide = () => { tip.hidden = true; };
export const hideTip = hide;

function show(html, x, y) {
  tip.innerHTML = html;
  tip.hidden = false;
  const { offsetWidth: w, offsetHeight: h } = tip;
  tip.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - w - 8))}px`;
  tip.style.top = `${y + 18 + h > innerHeight ? y - h - 12 : y + 18}px`;
}

export function bindTips(root) {
  root.addEventListener('pointermove', (e) => {
    const target = e.buttons ? null : e.target.closest?.('[data-tip]');
    if (target && root.contains(target)) show(target.dataset.tip, e.clientX, e.clientY);
    else hide();
  });
  root.addEventListener('pointerleave', hide);
}
