import type { EventKind } from "@/lib/evac-content";

/**
 * 想定シナリオのイラスト（アニメ風の想定図）。
 *
 * 実在の建物を加工した画像ではなく、完全な作図。
 *   - ストリートビューが使えないときの背景（デモ表示）
 *   - ストリートビューとは別枠で「どういう状況か」を示す想定図（仕様 7）
 * の2か所で使う。
 */
export function HazardSketch({
  kind,
  className = "",
}: {
  kind: EventKind | null;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 320 180"
      className={className}
      role="img"
      aria-label="想定シナリオのイメージ図（実在の場所の写真ではありません）"
      preserveAspectRatio="xMidYMid slice"
    >
      {/* 空 */}
      <rect width="320" height="180" fill="#dff1fb" />
      <circle cx="272" cy="30" r="16" fill="#fff2b8" />

      {/* 遠景の建物 */}
      <rect x="0" y="52" width="60" height="70" fill="#cfd8e3" />
      <rect x="228" y="44" width="92" height="78" fill="#c6d2e0" />
      <rect x="60" y="66" width="46" height="56" fill="#dbe3ec" />

      {/* 手前の建物（左右） */}
      <path d="M0 40 L96 74 L96 152 L0 168 Z" fill="#eef2f7" />
      <path d="M320 36 L214 74 L214 152 L320 172 Z" fill="#e6ecf3" />
      {[0, 1, 2].map((i) => (
        <rect
          key={`wl${i}`}
          x={16 + i * 26}
          y={62 + i * 5}
          width="16"
          height="20"
          fill="#bcd3e6"
        />
      ))}
      {[0, 1, 2].map((i) => (
        <rect
          key={`wr${i}`}
          x={238 + i * 26}
          y={70 - i * 4}
          width="16"
          height="20"
          fill="#bcd3e6"
        />
      ))}

      {/* 道路 */}
      <path d="M96 152 L214 152 L188 180 L122 180 Z" fill="#9aa5b1" />
      <path d="M96 152 L214 152 L246 180 L64 180 Z" fill="#a7b2bd" />
      <rect x="150" y="156" width="10" height="8" fill="#f7fafc" />
      <rect x="146" y="170" width="14" height="10" fill="#f7fafc" />

      {/* 歩道 */}
      <path d="M64 180 L96 152 L96 180 Z" fill="#cbd5e0" />
      <path d="M246 180 L214 152 L214 180 Z" fill="#cbd5e0" />

      {kind === "wall" ? <WallScene /> : null}
      {kind === "fall" ? <FallScene /> : null}
      {kind === "closed" ? <ClosedScene /> : null}
    </svg>
  );
}

/** ブロック塀の一部が崩れた想定 */
function WallScene() {
  return (
    <g>
      {/* 立っている部分（少し傾いている） */}
      <path d="M70 122 L104 134 L104 158 L70 152 Z" fill="#d6cfc4" stroke="#a89e90" strokeWidth="2" />
      <path d="M70 130 L104 141" stroke="#a89e90" strokeWidth="1.5" />
      <path d="M70 140 L104 150" stroke="#a89e90" strokeWidth="1.5" />
      {/* 崩れて散らばったブロック */}
      <g fill="#c9c0b3" stroke="#a89e90" strokeWidth="1.5">
        <rect x="106" y="158" width="18" height="10" rx="1" transform="rotate(-8 115 163)" />
        <rect x="126" y="164" width="16" height="9" rx="1" transform="rotate(6 134 168)" />
        <rect x="112" y="170" width="20" height="10" rx="1" transform="rotate(-3 122 175)" />
      </g>
      {/* ほこり */}
      <g fill="#ffffff" opacity="0.55">
        <circle cx="118" cy="150" r="12" />
        <circle cx="134" cy="156" r="9" />
        <circle cx="104" cy="146" r="8" />
      </g>
    </g>
  );
}

/** 外壁材・看板が落ちて道幅が狭くなった想定 */
function FallScene() {
  return (
    <g>
      {/* まだ外れかけている看板 */}
      <g transform="rotate(14 238 92)">
        <rect x="222" y="80" width="34" height="22" rx="2" fill="#ffd97a" stroke="#b87d00" strokeWidth="2" />
        <path d="M226 90 H252" stroke="#b87d00" strokeWidth="2" />
      </g>
      {/* 落下線 */}
      <g stroke="#ffffff" strokeWidth="2" opacity="0.8" strokeLinecap="round">
        <path d="M232 110 L228 128" />
        <path d="M244 108 L241 124" />
      </g>
      {/* 落ちた外壁材 */}
      <g fill="#e2d6c4" stroke="#a89e90" strokeWidth="1.5">
        <rect x="196" y="158" width="26" height="10" rx="1" transform="rotate(-10 209 163)" />
        <rect x="212" y="168" width="22" height="9" rx="1" transform="rotate(5 223 172)" />
        <rect x="178" y="166" width="18" height="8" rx="1" transform="rotate(-4 187 170)" />
      </g>
      <g fill="#ffffff" opacity="0.5">
        <circle cx="206" cy="160" r="10" />
        <circle cx="222" cy="168" r="7" />
      </g>
    </g>
  );
}

/** 道路が通行できない想定 */
function ClosedScene() {
  return (
    <g>
      {/* バリケード */}
      <g>
        <rect x="118" y="140" width="84" height="12" rx="2" fill="#ff9f1c" stroke="#b06a00" strokeWidth="2" />
        {[0, 1, 2, 3].map((i) => (
          <path
            key={i}
            d={`M${126 + i * 20} 140 L${138 + i * 20} 152`}
            stroke="#ffffff"
            strokeWidth="6"
          />
        ))}
        <rect x="122" y="152" width="6" height="22" fill="#8c8c8c" />
        <rect x="192" y="152" width="6" height="22" fill="#8c8c8c" />
      </g>
      {/* コーン */}
      <g>
        <path d="M104 174 L112 150 L120 174 Z" fill="#ff7a45" />
        <rect x="102" y="172" width="20" height="5" rx="1" fill="#e0562c" />
        <path d="M200 174 L208 150 L216 174 Z" fill="#ff7a45" />
        <rect x="198" y="172" width="20" height="5" rx="1" fill="#e0562c" />
      </g>
    </g>
  );
}
