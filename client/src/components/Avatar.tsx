export function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) return <img className="avatar" src={src} alt="" />;
  // 沒有頭像就用名字第一個字 + 固定的顏色
  const hue = [...name].reduce((h, ch) => (h * 31 + ch.codePointAt(0)!) % 360, 0);
  return (
    <span className="avatar" style={{ background: `hsl(${hue} 60% 45%)` }}>
      {[...name][0]}
    </span>
  );
}
