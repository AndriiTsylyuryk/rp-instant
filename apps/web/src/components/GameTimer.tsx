import { useState } from "react";
import { CountdownCircleTimer } from "react-countdown-circle-timer";

type Props = {
  /** Серверний час, коли відлік закінчується (state.nextBoundaryAt). */
  targetAt: number;
  /** Серверний час відповіді (state.serverNow). */
  serverNow: number;
  /** Повна тривалість фази в секундах (для частки кола). */
  totalSeconds: number;
  size?: number;
  /** Цифри у форматі m:ss (лобі) замість секунд (питання). */
  clock?: boolean;
  /** Колір змінюється від зеленого до червоного в кінці (питання). */
  urgency?: boolean;
};

const CALM = "#2e7d32";
const URGENCY = ["#2e7d32", "#f9a825", "#c62828", "#c62828"];

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Єдиний коло-таймер гри (лобі, питання, головний екран).
 *
 * Бібліотека відлічує за власним годинником, тому залишок рахуємо із серверних
 * часів один раз при монтуванні: так відлік не залежить від годинника клієнта,
 * а пізній вхід дає правильну частку кола. Опитування таймер не перезапускає.
 * Щоб перезапустити його для нової фази чи питання, змініть `key` у викликача.
 */
export function GameTimer({
  targetAt,
  serverNow,
  totalSeconds,
  size = 120,
  clock = false,
  urgency = false,
}: Props) {
  const [{ initial, duration }] = useState(() => {
    const left = Math.max(0, (targetAt - serverNow) / 1000);
    // Якщо початок пересунули далі, ніж лобі тривало, коло лишається повним.
    const total = Math.max(totalSeconds, left);
    return { initial: left, duration: total };
  });

  return (
    <div className="game-timer">
      <CountdownCircleTimer
        isPlaying
        duration={duration}
        initialRemainingTime={initial}
        colors={urgency ? URGENCY : CALM}
        {...(urgency
          ? { colorsTime: [duration, duration * 0.6, duration * 0.3, 0] }
          : {})}
        size={size}
        strokeWidth={Math.max(6, Math.round(size / 12))}
      >
        {({ remainingTime }) => (
          <span className="game-timer-text">
            {clock ? formatClock(remainingTime) : remainingTime}
          </span>
        )}
      </CountdownCircleTimer>
    </div>
  );
}
