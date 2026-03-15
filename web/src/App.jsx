import { useState, useEffect } from 'react'
import { restaurants } from './lib/restaurants'
import { Header } from './components/Header'
import { MenuCard } from './components/MenuCard'

const BASE = import.meta.env.BASE_URL

function App() {
  const [menuData, setMenuData] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchMenus() {
      const data = {}
      const fetches = restaurants
        .filter(r => r.dataFile)
        .map(async (r) => {
          try {
            const res = await fetch(`${BASE}data/${r.dataFile}`)
            if (res.ok) {
              data[r.id] = await res.json()
            }
          } catch {}
        })
      await Promise.all(fetches)
      setMenuData(data)
      setLoading(false)
    }
    fetchMenus()
  }, [])

  return (
    <div className="min-h-dvh pb-12">
      <Header />
      <main className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {restaurants.map((restaurant, i) => (
            <MenuCard
              key={restaurant.id}
              restaurant={restaurant}
              data={menuData[restaurant.id]}
              loading={loading && !!restaurant.dataFile}
              index={i}
            />
          ))}
        </div>
      </main>
      <footer className="text-center mt-12 pb-6 text-stone text-sm">
        매일 오전 10시 자동 업데이트
      </footer>
    </div>
  )
}

export default App
