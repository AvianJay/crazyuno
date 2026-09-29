import type { SVGProps } from 'react';

/** 介面上用的小圖示（取代文字）。顏色跟著 CSS 的 color 走。 */

type P = SVGProps<SVGSVGElement>;

function Svg({ children, ...p }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...p}
    >
      {children}
    </svg>
  );
}

/** 一疊牌 */
export const DeckIcon = (p: P) => (
  <Svg {...p}>
    <rect x="7" y="3" width="11" height="15" rx="2" fill="currentColor" fillOpacity={0.25} />
    <rect x="4" y="6" width="11" height="15" rx="2" fill="currentColor" fillOpacity={0.5} />
  </Svg>
);

/** 扇形手牌 */
export const HandIcon = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="6" width="8" height="12" rx="1.5" transform="rotate(-18 7 12)" />
    <rect x="8" y="5" width="8" height="12" rx="1.5" fill="currentColor" fillOpacity={0.3} />
    <rect x="13" y="6" width="8" height="12" rx="1.5" transform="rotate(18 17 12)" />
  </Svg>
);

/** 跳過（下一位） */
export const PassIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 5l9 7-9 7z" fill="currentColor" />
    <path d="M19 5v14" strokeWidth={3} />
  </Svg>
);

export const HourglassIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 3h12M6 21h12" />
    <path d="M7 3c0 5 10 5 10 9s-10 4-10 9" />
    <path d="M17 3c0 5-10 5-10 9s10 4 10 9" />
    <path d="M9.5 19.5c1-1.5 4-1.5 5 0z" fill="currentColor" />
  </Svg>
);

/** 往下指：看你的手牌 */
export const DownIcon = (p: P) => (
  <Svg {...p} strokeWidth={3}>
    <path d="M6 5l6 6 6-6" />
    <path d="M6 12l6 6 6-6" opacity={0.6} />
  </Svg>
);

export const EyeIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" fill="currentColor" />
  </Svg>
);

export const TrophyIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 4h10v5a5 5 0 01-10 0z" fill="currentColor" fillOpacity={0.35} />
    <path d="M7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4" />
    <path d="M12 14v4M8 21h8M9 18h6" />
  </Svg>
);

export const CrownIcon = (p: P) => (
  <Svg {...p}>
    <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" fill="currentColor" fillOpacity={0.9} />
  </Svg>
);

export const SkullIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3a8 8 0 00-5 14v3h10v-3a8 8 0 00-5-14z" fill="currentColor" fillOpacity={0.3} />
    <circle cx="9" cy="11" r="1.8" fill="currentColor" />
    <circle cx="15" cy="11" r="1.8" fill="currentColor" />
    <path d="M10 20v-2M14 20v-2" />
  </Svg>
);

/** 警示燈：抓沒喊 UNO 的人 */
export const SirenIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 18v-6a6 6 0 0112 0v6" fill="currentColor" fillOpacity={0.35} />
    <path d="M4 18h16v3H4zM12 2v2M4 6l1.5 1.5M20 6l-1.5 1.5" />
  </Svg>
);

export const TimerIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9v4l3 2M10 2h4" />
  </Svg>
);

/** 隱私權 */
export const ShieldIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="currentColor" fillOpacity={0.3} />
    <path d="M8.5 12l2.5 2.5 4.5-5" />
  </Svg>
);

/** 服務條款 */
export const DocIcon = (p: P) => (
  <Svg {...p}>
    <path d="M6 2h9l5 5v15H6z" fill="currentColor" fillOpacity={0.3} />
    <path d="M15 2v5h5M9 12h8M9 16h8" />
  </Svg>
);

export const CloseIcon = (p: P) => (
  <Svg {...p} strokeWidth={3}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

/** 高畫質 */
export const SparkleIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 2l2.2 6.3L20 10l-5.8 1.9L12 18l-2.2-6.1L4 10l5.8-1.7z" fill="currentColor" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" fill="currentColor" />
  </Svg>
);

/** 省電畫質 */
export const LeafIcon = (p: P) => (
  <Svg {...p}>
    <path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15" fill="currentColor" fillOpacity={0.35} />
    <path d="M4 20c4-5 7-8 11-10" />
  </Svg>
);

/** 離線的人由機器人代打 */
export const RobotIcon = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="8" width="16" height="12" rx="3" fill="currentColor" fillOpacity={0.3} />
    <circle cx="9" cy="14" r="1.6" fill="currentColor" />
    <circle cx="15" cy="14" r="1.6" fill="currentColor" />
    <path d="M12 8V4M10 4h4M2 13v3M22 13v3" />
  </Svg>
);

/** 回來了：揮手 */
export const WaveIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 11V6a1.5 1.5 0 013 0v4M10 10V4.5a1.5 1.5 0 013 0V10M13 10V5.5a1.5 1.5 0 013 0V12" />
    <path d="M16 9.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1a6 6 0 01-5-2.7L4.2 14a1.5 1.5 0 012.5-1.7L8 14" fill="currentColor" fillOpacity={0.25} />
  </Svg>
);

/** 爆牌上限 */
export const BombIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="11" cy="14" r="7" fill="currentColor" fillOpacity={0.35} />
    <path d="M15 9l3-3M18 3v2M21 6h-2M20 3.5l-1 1" />
  </Svg>
);

export const PlayIcon = (p: P) => (
  <Svg {...p}>
    <path d="M7 4l13 8-13 8z" fill="currentColor" />
  </Svg>
);

export const ReplayIcon = (p: P) => (
  <Svg {...p} strokeWidth={2.5}>
    <path d="M4 12a8 8 0 108-8H8" />
    <path d="M11 1L8 4l3 3" />
  </Svg>
);

export const GearIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1" />
  </Svg>
);

export const SpeakerIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
    <path d="M16 9a4 4 0 010 6M19 6a8 8 0 010 12" />
  </Svg>
);

export const MuteIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
    <path d="M17 9l5 6M22 9l-5 6" />
  </Svg>
);

export const PlusIcon = (p: P) => (
  <Svg {...p} strokeWidth={3}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const MinusIcon = (p: P) => (
  <Svg {...p} strokeWidth={3}>
    <path d="M5 12h14" />
  </Svg>
);

export const PlayersIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" fill="currentColor" fillOpacity={0.35} />
    <path d="M2 20a7 7 0 0114 0" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M17 14a5 5 0 015 5" />
  </Svg>
);

/** 怪牌：閃電 */
export const BoltIcon = (p: P) => (
  <Svg {...p}>
    <path d="M13 2L4 14h7l-1 8 9-12h-7z" fill="currentColor" />
  </Svg>
);

export const LockIcon = (p: P) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" fillOpacity={0.35} />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </Svg>
);

export const WifiOffIcon = (p: P) => (
  <Svg {...p}>
    <path d="M2 8.5a15 15 0 0120 0M5 12a10 10 0 0114 0M8.5 15.5a5 5 0 017 0" opacity={0.5} />
    <circle cx="12" cy="19" r="1.2" fill="currentColor" />
    <path d="M3 3l18 18" />
  </Svg>
);

export const AlertIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3l10 18H2z" fill="currentColor" fillOpacity={0.3} />
    <path d="M12 10v5M12 18v.5" strokeWidth={2.5} />
  </Svg>
);

export const InfinityIcon = (p: P) => (
  <Svg {...p} strokeWidth={2.5}>
    <path d="M12 12c-2-3-4-4-6-4a4 4 0 000 8c2 0 4-1 6-4s4-4 6-4a4 4 0 010 8c-2 0-4-1-6-4z" />
  </Svg>
);

/** 整局限時：時鐘 */
export const ClockIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity={0.25} />
    <path d="M12 7v5l3.5 2" />
  </Svg>
);

/** 換手牌：一來一往的箭頭 */
export const SwapIcon = (p: P) => (
  <Svg {...p}>
    <path d="M4 8h14l-4-4M20 16H6l4 4" strokeWidth={2.5} />
  </Svg>
);

/** 質疑 +4：放大鏡 */
export const SearchIcon = (p: P) => (
  <Svg {...p} strokeWidth={2.5}>
    <circle cx="10" cy="10" r="6.5" fill="currentColor" fillOpacity={0.25} />
    <path d="M15 15l6 6" strokeWidth={3.5} />
  </Svg>
);

/** 越疊越大：往上的箭頭 */
export const UpIcon = (p: P) => (
  <Svg {...p} strokeWidth={3}>
    <path d="M12 20V5M5 11l7-7 7 7" />
  </Svg>
);

/** 規則：天平 */
export const ScaleIcon = (p: P) => (
  <Svg {...p}>
    <path d="M12 3v17M7 21h10M4 7h16M4 7l-3 7M4 7l3 7M20 7l-3 7M20 7l3 7" />
    <path d="M1 14h6a3 3 0 01-6 0zM17 14h6a3 3 0 01-6 0z" fill="currentColor" fillOpacity={0.4} />
  </Svg>
);

export const CheckIcon = (p: P) => (
  <Svg {...p} strokeWidth={3}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Svg>
);

/** 邀請好友：一個人加號 */
export const InviteIcon = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.5" fill="currentColor" fillOpacity={0.35} />
    <path d="M2 20a7 7 0 0114 0" />
    <path d="M18 8v6M15 11h6" strokeWidth={2.5} />
  </Svg>
);

/** 離開活動：門 */
export const ExitIcon = (p: P) => (
  <Svg {...p}>
    <path d="M14 3H5v18h9" />
    <path d="M10 12h11M18 8l4 4-4 4" strokeWidth={2.5} />
  </Svg>
);

/** 麥克風：正在說話 */
export const MicIcon = (p: P) => (
  <Svg {...p}>
    <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" fillOpacity={0.4} />
    <path d="M5 11a7 7 0 0014 0M12 18v3M9 21h6" />
  </Svg>
);
