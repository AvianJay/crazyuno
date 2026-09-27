import { useEffect, useState, type CSSProperties } from 'react';
import { onFx } from './fx';

interface Slam {
  id: number;
  text: string;
  tone: string;
  color?: string;
}

let nextId = 0;

const EMOJI = /(\p{Extended_Pictographic}\uFE0F?)/u;

function splitEmoji(text: string) {
  return text.split(EMOJI).map((part, i) =>
    i % 2 ? (
      <span key={i} className="emoji">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** 畫面上砸下來的大字和全螢幕閃光（用 HTML 做，中文才清楚） */
export function FxLayer() {
  const [slams, setSlams] = useState<Slam[]>([]);
  const [flash, setFlash] = useState<{ id: number; color: string; strength: number } | null>(null);

  useEffect(
    () =>
      onFx((e) => {
        if (e.kind === 'text') {
          const slam = { id: nextId++, text: e.text, tone: e.tone ?? 'normal', color: e.color };
          setSlams((s) => [...s.slice(-2), slam]);
          setTimeout(() => setSlams((s) => s.filter((x) => x.id !== slam.id)), 1700);
        } else if (e.kind === 'flash') {
          setFlash({ id: nextId++, color: e.color, strength: e.strength ?? 0.5 });
        }
      }),
    [],
  );

  return (
    <div className="fx-layer">
      {flash && (
        <div
          key={flash.id}
          className="flash"
          style={{ '--c': flash.color, '--s': flash.strength } as CSSProperties}
          onAnimationEnd={() => setFlash(null)}
        />
      )}
      {slams.map((s, i) => (
        <div
          key={s.id}
          className={`slam ${s.tone}`}
          style={{ '--c': s.color ?? '#fff', top: `${34 + (i - slams.length + 1) * 12}%` } as CSSProperties}
        >
          {splitEmoji(s.text)}
        </div>
      ))}
    </div>
  );
}
