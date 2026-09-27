import { COLORS, type Card } from '@crazyuno/shared';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { backImage, faceImage } from '../cardFace';
import { AlertIcon, ReplayIcon } from './icons';

/** 載入中：三張牌一直洗來洗去 */
export function Loader({ caption }: { caption?: string }) {
  return (
    <div className="loader-screen">
      <FloatingCards />
      <div className="loader">
        <div className="shuffle">
          <img className="lc lc1" src={faceImage({ kind: 'number', color: 'red', value: 7 })} alt="" />
          <img className="lc lc2" src={backImage()} alt="" />
          <img className="lc lc3" src={faceImage({ kind: 'wild', color: null })} alt="" />
        </div>
        <div className="dots">
          {COLORS.map((c, i) => (
            <span key={c} className={`dot ${c}`} style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
        {caption && <div className="loader-caption">{caption}</div>}
      </div>
    </div>
  );
}

/** 連不上：一張裂開的牌 + 錯誤訊息 + 重新整理 */
export function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="loader-screen">
      <FloatingCards />
      <div className="loader error">
        <div className="broken">
          <img className="half left" src={backImage()} alt="" />
          <img className="half right" src={backImage()} alt="" />
          <AlertIcon className="broken-alert" />
        </div>
        <div className="loader-caption">{message}</div>
        <button className="round-btn" onClick={() => location.reload()} aria-label="重新整理">
          <ReplayIcon />
        </button>
      </div>
    </div>
  );
}

const FLOATERS: Pick<Card, 'kind' | 'color' | 'value'>[] = [
  { kind: 'number', color: 'red', value: 7 },
  { kind: 'skip', color: 'blue' },
  { kind: 'draw99', color: null },
  { kind: 'number', color: 'yellow', value: 3 },
  { kind: 'reverse', color: 'green' },
  { kind: 'wild4', color: null },
  { kind: 'swapAll', color: null },
  { kind: 'number', color: 'blue', value: 9 },
  { kind: 'mirror', color: 'red' },
  { kind: 'dice', color: null },
  { kind: 'draw2', color: 'yellow' },
  { kind: 'number', color: 'green', value: 0 },
];

/** 背景慢慢往上飄的牌 */
export function FloatingCards({ children }: { children?: ReactNode }) {
  const cards = useMemo(
    () =>
      FLOATERS.map((card, i) => ({
        src: i % 3 === 1 ? backImage() : faceImage(card),
        style: {
          left: `${(i / FLOATERS.length) * 100 + Math.random() * 6}%`,
          animationDuration: `${14 + Math.random() * 10}s`,
          animationDelay: `${-Math.random() * 20}s`,
          '--spin': `${(Math.random() - 0.5) * 540}deg`,
          '--size': `${40 + Math.random() * 40}px`,
        } as CSSProperties,
      })),
    [],
  );
  return (
    <div className="floaters" aria-hidden>
      {cards.map((c, i) => (
        <img key={i} className="floater" src={c.src} style={c.style} alt="" />
      ))}
      {children}
    </div>
  );
}
