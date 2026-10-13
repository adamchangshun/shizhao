import s from '../../shell.module.css'
import w from './wizard.module.css'

export const STEPS = ['upload', 'facts', 'generate', 'preview', 'publish'] as const
export type Step = (typeof STEPS)[number]

const NAMES: Record<Step, string> = {
  upload: '上传素材',
  facts: '核对信息',
  generate: '生成',
  preview: '预览',
  publish: '发布',
}

interface StepperProps {
  current: Step
  reachable: Record<Step, boolean>
  done: Record<Step, boolean>
  onSelect: (step: Step) => void
}

export function Stepper({ current, reachable, done, onSelect }: StepperProps) {
  return (
    <nav aria-label="制作步骤" className={w.stepper}>
      <ol>
        {STEPS.map((step, i) => {
          const isCurrent = step === current
          const status = done[step] && !isCurrent ? '已完成' : ''
          return (
            <li key={step} data-current={isCurrent} data-done={done[step] && !isCurrent}>
              <button
                type="button"
                className={w.stepBtn}
                aria-current={isCurrent ? 'step' : undefined}
                disabled={!reachable[step] && !isCurrent}
                onClick={() => onSelect(step)}
              >
                <span className={w.stepNum} aria-hidden="true">
                  {done[step] && !isCurrent ? '✓' : i + 1}
                </span>
                <span className={w.stepName}>{NAMES[step]}</span>
                {status && <span className={s.srOnly}>（{status}）</span>}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
