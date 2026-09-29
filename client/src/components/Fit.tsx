import { useLayoutEffect, useRef, type ReactNode } from 'react';

/**
 * 內容照設計好的大小排版，再整個等比例縮放、置中塞進外框（外框跟著父層一樣大）。
 * 視窗再小（Discord 的小視窗、手機橫放）都剛好一個畫面，不會出現捲軸；大螢幕最多放大到 max 倍。
 *
 * 用 transform 縮放，所以裡面的 position: fixed 會變成跟著內容走：彈出視窗要 createPortal 到 body。
 */
export function Fit({ className = '', max = 1, children }: { className?: string; max?: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null!);
  const inner = useRef<HTMLDivElement>(null!);

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    const fit = () => {
      // offsetWidth / offsetHeight 是還沒縮放的大小
      const s = Math.min(o.clientWidth / i.offsetWidth, o.clientHeight / i.offsetHeight, max);
      if (Number.isFinite(s) && s > 0) i.style.setProperty('--fit', String(s));
    };
    fit();
    // 外框變大小（轉手機、拉視窗）或內容變大小（有人加入、換排法）都重算
    const ro = new ResizeObserver(fit);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, [max]);

  return (
    <div ref={outer} className={`fit ${className}`}>
      <div ref={inner} className="fit-inner">
        {children}
      </div>
    </div>
  );
}
