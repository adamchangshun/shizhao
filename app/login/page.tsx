import '@fontsource/noto-serif-sc/700.css'
import { Suspense } from 'react'
import s from '../(console)/shell.module.css'
import l from './login.module.css'
import { LoginForm } from './login-form'

export const metadata = { title: '登录 · 实招 Shizhao' }

export default function LoginPage() {
  return (
    <div className={s.shell}>
      <main className={l.wrap}>
        <div className={`${s.card} ${l.card}`}>
          <p className={l.brand}>
            <span className={s.seal} aria-hidden="true">
              实招
            </span>
            实招
          </p>
          <h1 className={s.h1}>商家登录</h1>
          <p className={s.muted}>AI 只改颜值，不改事实。</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
