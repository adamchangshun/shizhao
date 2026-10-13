import '@fontsource/noto-serif-sc/700.css'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ConsoleProviders, LogoutButton } from './providers'
import s from './shell.module.css'

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <div className={s.shell}>
      <a href="#main" className={s.skip}>
        跳到主要内容
      </a>
      <header className={s.header}>
        <div className={s.headerInner}>
          <Link href="/" className={s.brand}>
            <span className={s.seal} aria-hidden="true">
              实招
            </span>
            实招
          </Link>
          <nav aria-label="主导航" className={s.nav}>
            <Link href="/" className={s.navLink}>
              我的宣传页
            </Link>
            <Link href="/check" className={s.navLink}>
              文案检查
            </Link>
            <LogoutButton className={s.navLink} />
          </nav>
        </div>
      </header>
      <ConsoleProviders>
        <main id="main" className={s.main}>
          {children}
        </main>
      </ConsoleProviders>
    </div>
  )
}
