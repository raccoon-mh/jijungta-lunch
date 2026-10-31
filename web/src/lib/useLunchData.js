import { useCallback, useEffect, useState } from 'react'

const BASE = import.meta.env.BASE_URL

function getToday() {
  return new Date().toISOString().split('T')[0]
}

// 점심 데이터(날짜 목록 + 선택 날짜 메뉴)를 불러오는 공유 훅.
// 기존 App.jsx의 로직과 동일하게 동작하며 여러 페이지에서 재사용한다.
export function useLunchData() {
  const [dates, setDates] = useState([])
  const [currentDate, setCurrentDate] = useState(getToday())
  const [dayData, setDayData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`${BASE}data/dates.json`)
      .then((r) => r.json())
      .then(setDates)
      .catch(() => setDates([]))
  }, [])

  const loadDate = useCallback(async (date) => {
    setLoading(true)
    setCurrentDate(date)
    try {
      const res = await fetch(`${BASE}data/${date}.json`)
      setDayData(res.ok ? await res.json() : null)
    } catch {
      setDayData(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (dates.length === 0) return
    const today = getToday()
    loadDate(dates.includes(today) ? today : dates[0])
  }, [dates, loadDate])

  const idx = dates.indexOf(currentDate)
  const hasPrev = idx < dates.length - 1
  const hasNext = idx > 0

  // offset -1 = 이전 날짜, +1 = 다음 날짜 (dates는 최신순 정렬)
  const goDay = useCallback(
    (offset) => {
      const i = dates.indexOf(currentDate)
      const next = i - offset
      if (next >= 0 && next < dates.length) loadDate(dates[next])
    },
    [dates, currentDate, loadDate],
  )

  return { dates, currentDate, dayData, loading, hasPrev, hasNext, goDay, loadDate }
}
