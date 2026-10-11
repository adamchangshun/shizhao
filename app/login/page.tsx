import { Suspense } from 'react'
import { LoginForm } from './login-form'

export const metadata = { title: '登录 · 实招 Shizhao' }

export default function LoginPage() {
  return (
    <main>
      <h1>商家登录</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  )
}
