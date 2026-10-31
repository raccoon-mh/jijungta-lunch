import { Component, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LiquidCanvas,
  GlassContainer,
  Glass,
  Html,
  VStack,
  HStack,
  ZStack,
  Frame,
} from '@liquid-dom/react'
import { ChevronLeft, ChevronRight, MapPin } from 'lucide-react'
import { restaurants, parseMenuBody, parseMenuSections } from '../lib/restaurants'
import { useLunchData } from '../lib/useLunchData'
import { cn } from '../lib/utils'

const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const GRADIENT =
  'radial-gradient(120% 120% at 15% 0%, #FCC57C 0%, #F59015 35%, #C4654A 70%, #7A3B11 100%)'

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00')
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS[d.getDay()]})`
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// 뷰포트 크기에서 그리드 컬럼 수와 카드 크기를 계산한다.
function useLayoutMetrics() {
  const [vp, setVp] = useState(() =>
    typeof window === 'undefined'
      ? { w: 1280, h: 800 }
      : { w: window.innerWidth, h: window.innerHeight },
  )
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const { w, h } = vp
  const cols = w < 640 ? 1 : w < 1024 ? 2 : 3
  const gap = 18
  const maxW = Math.min(w - 48, 1080)
  const cardW = Math.floor((maxW - gap * (cols - 1)) / cols)
  const cardH = cols === 1 ? 300 : 380
  const navW = 56
  const titleW = maxW - (navW + 12) * 2
  return { vw: w, vh: h, cols, gap, cardW, cardH, navW, titleW: Math.max(titleW, 120) }
}

const COLOR_TEXT = {
  warm: 'text-warm-600',
  terra: 'text-terra',
  sage: 'text-sage',
  stone: 'text-stone',
}

function HeaderTitle({ currentDate }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center text-charcoal select-none">
      <span className="font-display text-base font-bold leading-none">지정타 점심</span>
      <span className="text-xs text-stone mt-1 tabular-nums">{formatDate(currentDate)}</span>
    </div>
  )
}

function NavIcon({ dir, disabled }) {
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  return (
    <div
      className={cn(
        'w-full h-full flex items-center justify-center',
        disabled ? 'text-stone-light/40' : 'text-charcoal',
      )}
    >
      <Icon size={22} />
    </div>
  )
}

function CardContent({ restaurant, data, loading }) {
  const colorText = COLOR_TEXT[restaurant.color] || COLOR_TEXT.warm
  const sections = parseMenuSections(parseMenuBody(data?.body))

  return (
    <div className="w-full h-full flex flex-col p-5 text-charcoal">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-2xl">{restaurant.emoji}</span>
        <div>
          <h2 className="font-display text-lg font-bold leading-tight">{restaurant.name}</h2>
          <p className="text-xs text-stone mt-0.5">{restaurant.subtitle}</p>
        </div>
      </div>

      <div className="flex-1 overflow-hidden space-y-2.5">
        {loading ? (
          <p className="text-sm text-stone-light">불러오는 중…</p>
        ) : sections.length > 0 ? (
          sections.map((section, i) => (
            <div key={i}>
              {section.title && (
                <p className={cn('text-xs font-semibold mb-1 tracking-wide', colorText)}>
                  {section.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.items.map((item, j) => (
                  <li
                    key={j}
                    className="text-sm text-charcoal-light leading-relaxed flex items-baseline gap-1.5"
                  >
                    <span className="w-1 h-1 rounded-full shrink-0 mt-1.5 bg-current opacity-40" />
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

      <div className="mt-3 pt-3 border-t border-black/5 flex items-center gap-1.5 text-xs text-stone">
        <MapPin size={12} className="shrink-0" />
        <span className="truncate">{restaurant.location}</span>
      </div>
    </div>
  )
}

function Fallback({ reason }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center bg-cream">
      <span className="text-5xl mb-4">🥃</span>
      <h1 className="font-display text-2xl font-bold text-charcoal mb-2">Liquid Glass 미리보기</h1>
      <p className="text-stone max-w-md">
        {reason === 'no-gpu'
          ? '이 브라우저는 WebGPU를 지원하지 않습니다.'
          : '리퀴드 글래스 렌더링을 시작할 수 없습니다.'}
      </p>
      <div className="mt-4 text-sm text-stone-light max-w-md space-y-1.5">
        <p>
          이 실험 페이지는 <b className="text-stone">WebGPU</b>와 Chrome의 HTML-in-Canvas 플래그가
          필요합니다.
        </p>
        <p>
          최신 Chrome 주소창에{' '}
          <code className="px-1 py-0.5 rounded bg-cream-dark text-charcoal text-xs">
            chrome://flags/#canvas-draw-element
          </code>{' '}
          를 입력해 활성화한 뒤 새로고침하세요.
        </p>
      </div>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-warm-500 text-white text-sm font-medium hover:bg-warm-600 transition-colors"
      >
        ← 메인으로 돌아가기
      </Link>
    </div>
  )
}

// liquid-dom 렌더 중 동기 예외가 나면(예: 플래그 미활성) 폴백으로 전환.
class GlassBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error) {
    console.error('[liquid] render error', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function BackLink() {
  return (
    <Link
      to="/"
      className="fixed top-4 left-4 z-50 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/30 backdrop-blur-md text-white text-sm font-medium ring-1 ring-white/40 hover:bg-white/45 transition-colors"
    >
      <ChevronLeft size={16} /> 메인
    </Link>
  )
}

export default function LiquidApp() {
  const supported = typeof navigator !== 'undefined' && !!navigator.gpu
  const [failed, setFailed] = useState(false)
  const { currentDate, dayData, loading, hasPrev, hasNext, goDay } = useLunchData()
  const { vw, vh, cols, gap, cardW, cardH, navW, titleW } = useLayoutMetrics()

  if (!supported || failed) return <Fallback reason={supported ? 'render' : 'no-gpu'} />

  const active = restaurants.filter((r) => r.active)
  const rows = chunk(active, cols)

  return (
    <div className="relative w-screen h-dvh overflow-hidden">
      <BackLink />
      <GlassBoundary fallback={<Fallback reason="render" />}>
        <LiquidCanvas
          onError={() => setFailed(true)}
          style={{ width: '100%', height: '100%', background: GRADIENT }}
        >
          <Frame width={vw} height={vh} alignment="center">
            <ZStack alignment="center">
              {/* 씬 배경: 유리가 굴절·블러할 대상. 캔버스 CSS 배경이 아니라
                  씬 안에 있어야 유리 뒤가 검게 보이지 않는다. */}
              <Html sizing="fill" zIndex={0}>
                <div style={{ width: '100%', height: '100%', background: GRADIENT }} />
              </Html>

              <GlassContainer blur={10} spacing={22} zIndex={1}>
                <VStack spacing={18} alignment="center">
                  <HStack spacing={12} alignment="center">
                  <Frame width={navW} height={56}>
                    <Glass
                      cornerRadius={18}
                      cornerSmoothing={0.6}
                      pointerEvents
                      onClick={() => hasPrev && goDay(-1)}
                    >
                      <Html sizing="fill">
                        <NavIcon dir="prev" disabled={!hasPrev} />
                      </Html>
                    </Glass>
                  </Frame>

                  <Frame width={titleW} height={56}>
                    <Glass cornerRadius={22} cornerSmoothing={0.6}>
                      <Html sizing="fill">
                        <HeaderTitle currentDate={currentDate} />
                      </Html>
                    </Glass>
                  </Frame>

                  <Frame width={navW} height={56}>
                    <Glass
                      cornerRadius={18}
                      cornerSmoothing={0.6}
                      pointerEvents
                      onClick={() => hasNext && goDay(1)}
                    >
                      <Html sizing="fill">
                        <NavIcon dir="next" disabled={!hasNext} />
                      </Html>
                    </Glass>
                  </Frame>
                </HStack>

                {rows.map((row, ri) => (
                  <HStack key={ri} spacing={gap} alignment="center">
                    {row.map((r) => (
                      <Frame key={r.id} width={cardW} height={cardH}>
                        <Glass cornerRadius={28} cornerSmoothing={0.6}>
                          <Html sizing="fill">
                            <CardContent
                              restaurant={r}
                              data={dayData?.restaurants?.[r.id]}
                              loading={loading}
                            />
                          </Html>
                        </Glass>
                      </Frame>
                    ))}
                  </HStack>
                ))}
                </VStack>
              </GlassContainer>
            </ZStack>
          </Frame>
        </LiquidCanvas>
      </GlassBoundary>
    </div>
  )
}
