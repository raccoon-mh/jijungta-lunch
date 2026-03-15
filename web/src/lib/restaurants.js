// 식당 설정 — 새 식당 추가 시 여기에 등록
export const restaurants = [
  {
    id: 'goodfood_xi',
    name: '굿푸드',
    subtitle: '상상자이점',
    location: '과천상상자이타워 B1',
    hours: '11:00 ~ 14:00',
    days: '월~금',
    parking: '1시간 무료',
    dataFile: 'goodfood_xi-latest.json',
    color: 'warm',
    emoji: '🍚',
  },
  {
    id: 'gangnambab',
    name: '강남밥상',
    subtitle: '과천점',
    location: '과천대로7나길 37 2층',
    hours: '05:30 ~ 14:00',
    days: '월~금',
    parking: null,
    dataFile: 'gangnambab-latest.json',
    color: 'terra',
    emoji: '🍛',
  },
  {
    id: 'placeholder_1',
    name: '준비 중',
    subtitle: '새 식당',
    location: '-',
    hours: '-',
    days: '-',
    dataFile: null,
    color: 'stone',
    emoji: '🍜',
  },
  {
    id: 'placeholder_2',
    name: '준비 중',
    subtitle: '새 식당',
    location: '-',
    hours: '-',
    days: '-',
    dataFile: null,
    color: 'sage',
    emoji: '🍱',
  },
]

// 크롤링 데이터에서 메뉴 텍스트만 추출
export function parseMenuBody(body) {
  if (!body) return null

  let text = body
  // 계정명 + 시간 제거 (앞 부분)
  const menuStart = text.indexOf('(예정)')
  if (menuStart !== -1) {
    text = text.substring(menuStart)
  } else {
    // 날짜로 시작하는 패턴 찾기
    const dateMatch = text.match(/\d{4}년|\d{1,2}월\s*\d{1,2}일/)
    if (dateMatch) {
      text = text.substring(text.indexOf(dateMatch[0]))
    }
  }

  // 해시태그 이후 제거
  const hashIdx = text.indexOf('#')
  if (hashIdx !== -1) {
    text = text.substring(0, hashIdx).trim()
  }

  return text
}

// 메뉴를 섹션별로 파싱
export function parseMenuSections(text) {
  if (!text) return []

  const lines = text.split('\n').filter(l => l.trim())
  const sections = []
  let currentSection = { title: '', items: [] }

  for (const line of lines) {
    const trimmed = line.trim()

    // 날짜/예정 라인은 스킵
    if (trimmed.startsWith('(예정)') || /^\d{4}년/.test(trimmed)) continue
    // OCR 날짜 라인 스킵 (예: "3월 13일 금요일메뉴")
    if (/^\d{1,2}월\s*\d{1,2}일/.test(trimmed)) continue
    // 안내문 스킵
    if (trimmed.startsWith('※')) continue
    // 위치/시간 정보 스킵
    if (trimmed.startsWith('📍') || trimmed.startsWith('🅿') || trimmed.startsWith('🕚') || trimmed.startsWith('🗓')) continue

    // 섹션 헤더 (<한식코너> 등)
    if (trimmed.startsWith('<') && trimmed.endsWith('>')) {
      if (currentSection.title || currentSection.items.length) {
        sections.push(currentSection)
      }
      currentSection = { title: trimmed.replace(/[<>]/g, ''), items: [] }
    } else if (trimmed.length > 0) {
      currentSection.items.push(trimmed)
    }
  }

  if (currentSection.title || currentSection.items.length) {
    sections.push(currentSection)
  }

  return sections
}

// 날짜 텍스트 추출
export function parseDateFromBody(body) {
  if (!body) return null
  // goodfood_xi 형식: 2026년 03월 16일 월요일
  const match1 = body.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\S+요일)/)
  if (match1) {
    return `${match1[1]}.${match1[2].padStart(2, '0')}.${match1[3].padStart(2, '0')} ${match1[4]}`
  }
  // gangnambab OCR 형식: 3월 13일 금요일
  const match2 = body.match(/(\d{1,2})월\s*(\d{1,2})일\s*(\S+요일)/)
  if (match2) {
    const year = new Date().getFullYear()
    return `${year}.${match2[1].padStart(2, '0')}.${match2[2].padStart(2, '0')} ${match2[3]}`
  }
  return null
}
