/**
 * 隱私權政策、服務條款頁共用：切換語言、背景飄的牌、捲動淡入、填入聯絡方式。
 * 沒開 JS 也看得到全部內容（兩種語言都顯示）。
 */
import { backImage, faceImage } from '../cardFace';

const root = document.documentElement;
const params = new URLSearchParams(location.search);
root.classList.add('js');
if (params.has('embed')) root.classList.add('embed');

// ---------- 語言：網址 ?lang= > 上次選的 > 瀏覽器語言 ----------

type Lang = 'zh' | 'en';

function pickLang(): Lang {
  const fromUrl = params.get('lang');
  if (fromUrl === 'zh' || fromUrl === 'en') return fromUrl;
  try {
    const saved = localStorage.getItem('crazyuno:lang');
    if (saved === 'zh' || saved === 'en') return saved;
  } catch {
    // 讀不到就看瀏覽器語言
  }
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function setLang(lang: Lang) {
  root.lang = lang === 'zh' ? 'zh-Hant' : 'en';
  for (const el of document.querySelectorAll<HTMLElement>('[data-lang]')) {
    el.classList.toggle('active', el.dataset.lang === lang);
  }
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-set-lang]')) {
    btn.classList.toggle('on', btn.dataset.setLang === lang);
  }
  // 換頁的連結帶著語言和 embed，換過去還是同一種
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-keep]')) {
    const url = new URL(a.href);
    url.searchParams.set('lang', lang);
    if (params.has('embed')) url.searchParams.set('embed', '1');
    a.href = url.pathname + url.search;
  }
  try {
    localStorage.setItem('crazyuno:lang', lang);
  } catch {
    // 無痕模式存不了，沒關係
  }
}

for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-set-lang]')) {
  btn.addEventListener('click', () => setLang(btn.dataset.setLang as Lang));
}
setLang(pickLang());

// ---------- 聯絡方式：.env 的 VITE_CONTACT（email 或網址） ----------

const contact = String(import.meta.env.VITE_CONTACT ?? '').trim();
for (const el of document.querySelectorAll<HTMLElement>('[data-contact]')) {
  if (!contact) {
    el.textContent = el.closest('[data-lang="en"]')
      ? '⚠ Contact not set yet (VITE_CONTACT in .env)'
      : '⚠ 尚未設定聯絡方式（.env 的 VITE_CONTACT）';
    el.className = 'contact-missing';
    continue;
  }
  const a = document.createElement('a');
  a.textContent = contact;
  a.href = contact.includes('@') && !contact.startsWith('http') ? `mailto:${contact}` : contact;
  if (a.href.startsWith('http')) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  el.replaceChildren(a);
}

// ---------- 背景飄的牌 ----------

if (!params.has('embed') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const cards = [
    faceImage({ kind: 'number', color: 'red', value: 7 }),
    backImage(),
    faceImage({ kind: 'draw99', color: null }),
    faceImage({ kind: 'reverse', color: 'green' }),
    faceImage({ kind: 'wild', color: null }),
    backImage(),
    faceImage({ kind: 'skip', color: 'blue' }),
    faceImage({ kind: 'number', color: 'yellow', value: 3 }),
  ];
  const layer = document.createElement('div');
  layer.className = 'floaters';
  layer.setAttribute('aria-hidden', 'true');
  cards.forEach((src, i) => {
    const img = document.createElement('img');
    img.className = 'floater';
    img.src = src;
    img.alt = '';
    img.style.left = `${(i / cards.length) * 100 + Math.random() * 8}%`;
    img.style.width = `${40 + Math.random() * 36}px`;
    img.style.animationDuration = `${16 + Math.random() * 10}s`;
    img.style.animationDelay = `${-Math.random() * 20}s`;
    img.style.setProperty('--spin', `${(Math.random() - 0.5) * 540}deg`);
    layer.append(img);
  });
  document.body.prepend(layer);
}

// ---------- 捲到才淡入 ----------

const io = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  },
  { rootMargin: '0px 0px -40px 0px' },
);
for (const el of document.querySelectorAll('.reveal')) io.observe(el);
