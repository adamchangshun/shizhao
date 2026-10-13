import type { ReactNode } from 'react'
import s from '../../shell.module.css'

/** Focus target when the wizard moves to this step (see Workspace). */
export function StepHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className={s.h2} tabIndex={-1}>
      {children}
    </h2>
  )
}
