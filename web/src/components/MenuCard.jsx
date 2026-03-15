import { useState } from 'react'
import { cn } from '../lib/utils'
import { parseMenuBody, parseMenuSections, parseDateFromBody } from '../lib/restaurants'
import { MapPin, Clock, Car, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'

const colorMap = {
  warm: {
    accent: 'bg-warm-500',
    accentLight: 'bg-warm-100',
    text: 'text-warm-700',
    border: 'border-warm-200',
    badge: 'bg-warm-50 text-warm-700 ring-warm-200',
    dot: 'bg-warm-400',
  },
  stone: {
    accent: 'bg-stone',
    accentLight: 'bg-cream-dark',
    text: 'text-stone',
    border: 'border-stone-light/40',
    badge: 'bg-cream-dark text-stone ring-stone-light/30',
    dot: 'bg-stone-light',
  },
  sage: {
    accent: 'bg-sage',
    accentLight: 'bg-sage-light/20',
    text: 'text-sage',
    border: 'border-sage-light/40',
    badge: 'bg-sage-light/15 text-sage ring-sage-light/30',
    dot: 'bg-sage-light',
  },
  terra: {
    accent: 'bg-terra',
    accentLight: 'bg-rust/10',
    text: 'text-terra',
    border: 'border-rust/20',
    badge: 'bg-rust/8 text-terra ring-rust/20',
    dot: 'bg-rust-light',
  },
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm animate-pulse">
      <div className="h-5 bg-cream-dark rounded w-1/2 mb-3" />
      <div className="h-3 bg-cream-dark rounded w-1/3 mb-6" />
      <div className="space-y-2">
        <div className="h-3 bg-cream-dark rounded w-full" />
        <div className="h-3 bg-cream-dark rounded w-4/5" />
        <div className="h-3 bg-cream-dark rounded w-3/5" />
        <div className="h-3 bg-cream-dark rounded w-4/5" />
        <div className="h-3 bg-cream-dark rounded w-2/5" />
      </div>
    </div>
  )
}

function PlaceholderCard({ restaurant, colors }) {
  return (
    <div className={cn(
      'bg-white/60 rounded-2xl p-5 border border-dashed',
      colors.border,
      'flex flex-col items-center justify-center min-h-[240px]',
    )}>
      <span className="text-4xl mb-3 grayscale opacity-40">{restaurant.emoji}</span>
      <p className="text-stone-light font-medium text-sm">식당 추가 예정</p>
    </div>
  )
}

export function MenuCard({ restaurant, data, loading, index }) {
  const [expanded, setExpanded] = useState(false)
  const colors = colorMap[restaurant.color] || colorMap.warm

  if (loading) return <SkeletonCard />
  if (!restaurant.dataFile) return <PlaceholderCard restaurant={restaurant} colors={colors} />

  const menuText = parseMenuBody(data?.body)
  const sections = parseMenuSections(menuText)
  const menuDate = parseDateFromBody(data?.body)

  return (
    <div
      className={cn(
        'animate-fade-up bg-white rounded-2xl shadow-sm',
        'hover:shadow-md transition-shadow duration-300',
        'flex flex-col overflow-hidden',
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* 컬러 스트라이프 */}
      <div className={cn('h-1.5', colors.accent)} />

      <div className="p-5 flex flex-col flex-1">
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{restaurant.emoji}</span>
            <div>
              <h2 className="font-display text-lg font-bold text-charcoal leading-tight">
                {restaurant.name}
              </h2>
              <p className="text-xs text-stone mt-0.5">{restaurant.subtitle}</p>
            </div>
          </div>
          {data?.url && (
            <a
              href={data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-stone-light hover:text-warm-500 transition-colors p-1"
              title="Instagram에서 보기"
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>

        {/* 날짜 배지 */}
        {menuDate && (
          <div className={cn(
            'inline-flex self-start items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium mt-2 mb-3 ring-1',
            colors.badge,
          )}>
            <span className={cn('w-1.5 h-1.5 rounded-full', colors.dot)} />
            {menuDate}
          </div>
        )}

        {/* 메뉴 섹션 */}
        <div className={cn(
          'flex-1 space-y-3 overflow-hidden transition-all duration-300',
          !expanded && 'max-h-[220px] sm:max-h-[260px]',
          expanded && 'max-h-[800px]',
        )}>
          {sections.length > 0 ? (
            sections.map((section, i) => (
              <div key={i}>
                {section.title && (
                  <p className={cn('text-xs font-semibold mb-1.5 tracking-wide', colors.text)}>
                    {section.title}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {section.items.map((item, j) => (
                    <li key={j} className="text-sm text-charcoal-light leading-relaxed flex items-baseline gap-1.5">
                      <span className={cn('w-1 h-1 rounded-full shrink-0 mt-1.5', colors.dot, 'opacity-50')} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="text-sm text-stone-light italic">메뉴 정보 없음</p>
          )}
        </div>

        {/* 더보기 버튼 */}
        {sections.length > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="mt-3 flex items-center justify-center gap-1 text-xs text-stone hover:text-charcoal transition-colors w-full py-1.5"
          >
            {expanded ? (
              <><ChevronUp size={14} /> 접기</>
            ) : (
              <><ChevronDown size={14} /> 더보기</>
            )}
          </button>
        )}

        {/* 하단 정보 */}
        <div className={cn('mt-3 pt-3 border-t space-y-1.5', colors.border)}>
          <div className="flex items-center gap-1.5 text-xs text-stone">
            <MapPin size={12} className="shrink-0" />
            <span>{restaurant.location}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-stone">
            <Clock size={12} className="shrink-0" />
            <span>{restaurant.hours} · {restaurant.days}</span>
          </div>
          {restaurant.parking && (
            <div className="flex items-center gap-1.5 text-xs text-stone">
              <Car size={12} className="shrink-0" />
              <span>주차 {restaurant.parking}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
