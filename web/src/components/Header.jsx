export function Header() {
  const today = new Date()
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']
  const formatted = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')} ${dayNames[today.getDay()]}요일`

  return (
    <header className="pt-10 pb-8 sm:pt-14 sm:pb-10 px-4 text-center">
      <h1 className="font-display text-3xl sm:text-4xl font-bold text-charcoal tracking-tight">
        오늘의 점심
      </h1>
      <p className="mt-2 text-stone text-sm sm:text-base font-medium tracking-wide">
        {formatted}
      </p>
      <div className="mt-4 mx-auto w-12 h-0.5 bg-warm-400/40 rounded-full" />
    </header>
  )
}
