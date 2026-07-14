import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const services = [
  'Замена масла',
  'Шиномонтаж',
  'Диагностика подвески',
  'Замена тормозных колодок',
  'Развал-схождение',
  'Компьютерная диагностика',
]

const times = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30']

function getToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function formatDate(date) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`))
}

function App() {
  return window.location.pathname === '/admin' ? <AdminPage /> : <BookingPage />
}

function BookingPage() {
  const today = useMemo(getToday, [])
  const [form, setForm] = useState({ service: services[0], date: '', time: '', name: '', phone: '', car: '' })
  const [errors, setErrors] = useState({})
  const [booking, setBooking] = useState(null)
  const [submitError, setSubmitError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function updateField(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: '' }))
    setSubmitError('')
  }

  function validate() {
    const nextErrors = {}
    const cleanName = form.name.trim()
    const phoneDigits = form.phone.replace(/\D/g, '')

    if (!cleanName) nextErrors.name = 'Введите имя'
    else if (!/^[a-zа-яё\s-]{2,}$/i.test(cleanName)) nextErrors.name = 'Укажите имя буквами'
    if (!phoneDigits) nextErrors.phone = 'Введите телефон'
    else if (phoneDigits.length < 10 || phoneDigits.length > 15) nextErrors.phone = 'Проверьте номер телефона'
    if (!form.date) nextErrors.date = 'Выберите дату'
    else if (form.date < today) nextErrors.date = 'Дата не может быть в прошлом'
    if (!form.time) nextErrors.time = 'Выберите время'

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    setSubmitError('')
    const payload = {
      service: form.service,
      booking_date: form.date,
      booking_time: form.time,
      name: form.name.trim(),
      phone: form.phone.trim(),
      car: form.car.trim() || null,
    }

    const { error } = await supabase.from('bookings').insert(payload)
    setIsSubmitting(false)
    if (error) {
      setSubmitError('Не удалось отправить заявку. Проверьте интернет и попробуйте ещё раз.')
      return
    }
    try {
      const notificationUrl = import.meta.env.VITE_NOTIFICATION_URL || 'http://127.0.0.1:8787/notify'
      const notificationResponse = await fetch(notificationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!notificationResponse.ok) console.warn('Заявка сохранена, но уведомление не отправлено')
    } catch {
      console.warn('Заявка сохранена, но сервис уведомлений недоступен')
    }
    setBooking(payload)
  }

  if (booking) {
    return <main className="min-h-screen px-5 py-6 sm:px-8"><div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-xl flex-col"><Header /><section className="animate-rise flex flex-1 flex-col justify-center pb-10 pt-12"><div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-lime text-3xl text-ink shadow-[0_0_0_8px_rgba(210,255,60,0.12)]">✓</div><p className="eyebrow mb-3 text-lime">Заявка принята</p><h1 className="max-w-md text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-5xl">Запись подтверждена</h1><p className="mt-4 max-w-sm text-base leading-7 text-zinc-400">Ждём вас в «Гараж 24». Если планы изменятся, позвоните нам по телефону сервиса.</p><div className="mt-10 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.04] px-5"><Detail label="Услуга" value={booking.service} /><Detail label="Дата и время" value={`${formatDate(booking.booking_date)}, ${booking.booking_time}`} /><Detail label="Автомобиль" value={booking.car || 'Не указан'} /></div><button className="mt-6 w-full rounded-xl bg-white px-5 py-4 text-sm font-semibold text-ink transition hover:bg-lime" onClick={() => setBooking(null)} type="button">Новая запись</button></section><Footer /></div></main>
  }

  return <main className="min-h-screen px-5 py-6 sm:px-8"><div className="mx-auto max-w-xl"><Header /><form className="animate-rise pb-10 pt-12" onSubmit={handleSubmit} noValidate><div className="mb-8"><p className="eyebrow mb-3 text-lime">Онлайн-запись</p><h1 className="max-w-lg text-4xl font-semibold leading-[1.05] tracking-[-0.04em] text-white sm:text-5xl">Запишитесь в сервис за минуту</h1><p className="mt-4 max-w-sm text-base leading-7 text-zinc-400">Выберите удобные дату и время — мы всё подготовим к вашему приезду.</p></div><div className="space-y-8"><Field label="Услуга" htmlFor="service"><select className="field" id="service" name="service" onChange={updateField} value={form.service}>{services.map((service) => <option key={service}>{service}</option>)}</select></Field><div className="grid gap-4 sm:grid-cols-2"><Field error={errors.date} label="Дата" htmlFor="date"><input className={`field ${errors.date ? 'field-error' : ''}`} id="date" min={today} name="date" onChange={updateField} type="date" value={form.date} /></Field><Field error={errors.time} label="Время" htmlFor="time"><select className={`field ${errors.time ? 'field-error' : ''} ${!form.time ? 'field-placeholder' : ''}`} id="time" name="time" onChange={updateField} value={form.time}><option value="">Выберите время</option>{times.map((time) => <option key={time}>{time}</option>)}</select></Field></div><div className="space-y-5 border-t border-white/10 pt-8"><p className="eyebrow text-zinc-500">Ваши контакты</p><Field error={errors.name} label="Имя" htmlFor="name"><input autoComplete="name" className={`field ${errors.name ? 'field-error' : ''}`} id="name" maxLength="100" name="name" onChange={updateField} placeholder="Как к вам обращаться" type="text" value={form.name} /></Field><Field error={errors.phone} label="Телефон" htmlFor="phone"><input autoComplete="tel" className={`field ${errors.phone ? 'field-error' : ''}`} id="phone" inputMode="tel" maxLength="25" name="phone" onChange={updateField} placeholder="+7 700 000 00 00" type="tel" value={form.phone} /></Field><Field label="Марка и модель авто" htmlFor="car"><input autoComplete="off" className="field" id="car" maxLength="100" name="car" onChange={updateField} placeholder="Например, Toyota Camry" type="text" value={form.car} /></Field></div></div>{submitError && <p className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm leading-6 text-red-200" role="alert">{submitError}</p>}<button className="mt-9 w-full rounded-xl bg-lime px-5 py-4 text-sm font-bold text-ink transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-lime/60 focus:ring-offset-2 focus:ring-offset-ink disabled:cursor-wait disabled:opacity-60" disabled={isSubmitting} type="submit">{isSubmitting ? 'Отправляем…' : 'Записаться'}{!isSubmitting && <span className="ml-2 text-lg leading-none">→</span>}</button><p className="mt-4 text-center text-xs leading-5 text-zinc-500">Нажимая кнопку, вы отправляете заявку на запись в сервис.</p></form><Footer /></div></main>
}

function AdminPage() {
  const [session, setSession] = useState(undefined)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [bookings, setBookings] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return
    setLoading(true)
    supabase.from('bookings').select('*').order('created_at', { ascending: false }).then(({ data, error: fetchError }) => {
      setBookings(data || [])
      if (fetchError) setError('Не удалось загрузить заявки.')
      setLoading(false)
    })
  }, [session])

  async function handleLogin(event) {
    event.preventDefault()
    setError('')
    setLoading(true)
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (loginError) setError('Неверный email или пароль.')
  }

  if (session === undefined) return <AdminShell><p className="text-zinc-400">Проверяем вход…</p></AdminShell>
  if (!session) return <AdminShell><form className="animate-rise space-y-5" onSubmit={handleLogin}><div><p className="eyebrow mb-3 text-lime">Закрытый раздел</p><h1 className="text-4xl font-semibold tracking-[-0.04em] text-white">Вход в админку</h1><p className="mt-3 text-sm leading-6 text-zinc-400">Войдите с учётными данными Supabase.</p></div><Field label="Email" htmlFor="email"><input autoComplete="email" className="field" id="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></Field><Field label="Пароль" htmlFor="password"><input autoComplete="current-password" className="field" id="password" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></Field>{error && <p className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{error}</p>}<button className="w-full rounded-xl bg-lime px-5 py-4 text-sm font-bold text-ink disabled:opacity-60" disabled={loading} type="submit">{loading ? 'Входим…' : 'Войти'}</button></form></AdminShell>

  return <AdminShell><div className="flex items-start justify-between gap-4"><div><p className="eyebrow mb-3 text-lime">Панель администратора</p><h1 className="text-4xl font-semibold tracking-[-0.04em] text-white">Заявки</h1></div><button className="rounded-lg border border-white/15 px-3 py-2 text-sm text-zinc-300 transition hover:border-lime hover:text-white" onClick={() => supabase.auth.signOut()} type="button">Выйти</button></div>{error && <p className="mt-6 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}{loading ? <p className="mt-10 text-zinc-400">Загружаем заявки…</p> : bookings.length === 0 ? <p className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-zinc-400">Заявок пока нет.</p> : <div className="mt-8 space-y-3">{bookings.map((booking) => <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5" key={booking.id || booking.created_at}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-white">{booking.name}</h2><p className="mt-1 text-sm text-lime">{booking.service}</p></div><time className="text-xs text-zinc-500">{new Date(booking.created_at).toLocaleString('ru-RU')}</time></div><div className="mt-4 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2"><span>Дата: <b className="font-medium text-white">{booking.booking_date}</b></span><span>Время: <b className="font-medium text-white">{booking.booking_time}</b></span><span>Телефон: <b className="font-medium text-white">{booking.phone}</b></span><span>Авто: <b className="font-medium text-white">{booking.car || 'Не указано'}</b></span></div></article>)}</div>}</AdminShell>
}

function AdminShell({ children }) { return <main className="min-h-screen px-5 py-6 sm:px-8"><div className="mx-auto max-w-3xl"><Header /><section className="animate-rise pb-10 pt-12">{children}</section><Footer /></div></main> }
function Header() { return <header className="flex items-center justify-between border-b border-white/10 pb-5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-lime text-sm font-black text-ink">24</span><span className="text-sm font-semibold tracking-wide text-white">ГАРАЖ <span className="text-lime">24</span></span></div><span className="text-xs text-zinc-500">СТО · ежедневно 09:00–18:00</span></header> }
function Footer() { return <footer className="border-t border-white/10 py-5 text-xs text-zinc-600">© 2024 Гараж 24 · Сервис и забота об автомобиле</footer> }
function Detail({ label, value }) { return <div className="flex items-start justify-between gap-4 py-4"><span className="text-sm text-zinc-500">{label}</span><span className="text-right text-sm font-medium text-white">{value}</span></div> }
function Field({ children, error, htmlFor, label }) { return <label className="block" htmlFor={htmlFor}><span className="mb-2 flex items-baseline justify-between text-sm font-medium text-zinc-300"><span>{label}</span>{error && <span className="text-xs font-normal text-red-400">{error}</span>}</span>{children}</label> }

export default App
