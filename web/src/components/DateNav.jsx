import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'
import { useEffect, useRef } from 'react'

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  const month = d.getMonth() + 1
  const day = d.getDate()
  const dayName = DAY_NAMES[d.getDay()]
  return { month, day, dayName }
}

function isToday(dateStr) {
  return dateStr === new Date().toISOString().split('T')[0]
}

export function DateNav({ currentDate, onPrev, onNext, hasPrev, hasNext }) {
  const { month, day, dayName } = formatDate(currentDate)
  const today = isToday(currentDate)
  const startX = useRef(null)

  // 스와이프 지원
  useEffect(() => {
    const el = document.getElementById('date-nav')
    if (!el) return
    const onTouchStart = (e) => { startX.current = e.touches[0].clientX }
    const onTouchEnd = (e) => {
      if (startX.current === null) return
      const diff = startX.current - e.changedTouches[0].clientX
      if (Math.abs(diff) > 50) {
        if (diff > 0 && hasNext) onNext()
        else if (diff < 0 && hasPrev) onPrev()
      }
      startX.current = null
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [hasPrev, hasNext, onPrev, onNext])

  // 키보드 지원
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft' && hasPrev) onPrev()
      if (e.key === 'ArrowRight' && hasNext) onNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [hasPrev, hasNext, onPrev, onNext])

  return (
    <div
      id="date-nav"
      className="sticky top-0 z-10 bg-cream/80 backdrop-blur-md border-b border-warm-200/50"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className={cn(
            'flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all',
            hasPrev
              ? 'text-charcoal hover:bg-cream-dark active:scale-95'
              : 'text-stone-light/50 cursor-not-allowed',
          )}
        >
          <ChevronLeft size={18} />
          <span className="hidden sm:inline">이전</span>
        </button>

        <div className="flex items-center gap-2.5 select-none">
          <span className="font-display text-xl sm:text-2xl font-bold text-charcoal tabular-nums">
            {month}월 {day}일
          </span>
          <span className={cn(
            'text-sm font-medium px-2 py-0.5 rounded-full',
            today
              ? 'bg-warm-500 text-white'
              : 'bg-cream-dark text-stone',
          )}>
            {dayName}
          </span>
          {today && (
            <span className="text-[10px] font-semibold text-warm-600 tracking-wider uppercase">
              today
            </span>
          )}
        </div>

        <button
          onClick={onNext}
          disabled={!hasNext}
          className={cn(
            'flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all',
            hasNext
              ? 'text-charcoal hover:bg-cream-dark active:scale-95'
              : 'text-stone-light/50 cursor-not-allowed',
          )}
        >
          <span className="hidden sm:inline">다음</span>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  )
}
