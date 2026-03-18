import { useState, useEffect, useCallback } from 'react'
import { restaurants } from './lib/restaurants'
import { Header } from './components/Header'
import { DateNav } from './components/DateNav'
import { MenuCard } from './components/MenuCard'

const BASE = import.meta.env.BASE_URL

function getToday() {
  const now = new Date()
  return now.toISOString().split('T')[0]
}

function App() {
  const [dates, setDates] = useState([])
  const [currentDate, setCurrentDate] = useState(getToday())
  const [dayData, setDayData] = useState(null)
  const [loading, setLoading] = useState(true)

  // 날짜 목록 로드
  useEffect(() => {
    fetch(`${BASE}data/dates.json`)
      .then(r => r.json())
      .then(setDates)
      .catch(() => setDates([]))
  }, [])

  // 날짜별 데이터 로드
  const loadDate = useCallback(async (date) => {
    setLoading(true)
    setCurrentDate(date)
    try {
      const res = await fetch(`${BASE}data/${date}.json`)
      if (res.ok) {
        setDayData(await res.json())
      } else {
        setDayData(null)
      }
    } catch {
      setDayData(null)
    }
    setLoading(false)
  }, [])

  // 초기 로드: 오늘 또는 가장 최근 날짜
  useEffect(() => {
    if (dates.length === 0) return
    const today = getToday()
    const target = dates.includes(today) ? today : dates[0]
    loadDate(target)
  }, [dates, loadDate])

  const goDay = (offset) => {
    const idx = dates.indexOf(currentDate)
    // offset -1 = 이전 날짜 (dates 배열에서 뒤로), +1 = 다음 날짜 (앞으로)
    const newIdx = idx - offset
    if (newIdx >= 0 && newIdx < dates.length) {
      loadDate(dates[newIdx])
    }
  }

  const hasPrev = dates.indexOf(currentDate) < dates.length - 1
  const hasNext = dates.indexOf(currentDate) > 0

  return (
    <div className="min-h-dvh pb-12">
      <Header />
      <DateNav
        currentDate={currentDate}
        onPrev={() => goDay(-1)}
        onNext={() => goDay(1)}
        hasPrev={hasPrev}
        hasNext={hasNext}
      />
      <main className="max-w-6xl mx-auto px-4 sm:px-6">
        {!loading && !dayData && (
          <div className="text-center py-16 text-stone">
            <p className="text-lg">해당 날짜의 데이터가 없습니다</p>
            <p className="text-sm mt-1">평일에만 메뉴가 업데이트됩니다</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {restaurants.map((restaurant, i) => (
            <MenuCard
              key={restaurant.id}
              restaurant={restaurant}
              data={dayData?.restaurants?.[restaurant.id]}
              loading={loading && restaurant.active}
              index={i}
            />
          ))}
        </div>
      </main>
      <footer className="text-center mt-12 pb-6 text-stone text-sm space-y-1">
        <p>매일 오전 10시 자동 업데이트</p>
        {dayData?.updatedAt && (
          <p className="text-xs text-stone-light">
            마지막 업데이트: {new Date(dayData.updatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
          </p>
        )}
      </footer>
    </div>
  )
}

export default App
