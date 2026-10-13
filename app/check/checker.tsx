'use client'

import Link from 'next/link'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { GuardHit, GuardResponse } from '@/lib/guard-api/schema'
import styles from './checker.module.css'

const EXAMPLES = [
  {
    name: '烘焙店文案',
    text: '当天现烤，6 寸只要 128 元。外酥里嫩，香气扑鼻。',
    facts: '当天现烤\n6寸\n128元',
  },
  {
    name: '奶茶店文案',
    text: '零糖配方，喝出好心情。午后慢慢喝，和朋友聊聊天。',
    facts: '芒果奶茶\n大杯\n16元',
  },
  { name: '反面示例', text: '零糖配方，全网销量第一。适合午后的一块甜。', facts: '' },
]
const REASONS: Record<GuardHit['reason'], string> = {
  unsupported_number: '事实表中没有的数字',
  unsupported_claim: '无依据的事实声明',
  ad_law_absolute: '广告法禁止的绝对化用语',
  llm_flagged: '模型提示：缺少事实依据',
}

function Highlight({
  text,
  hits,
  onReason,
}: {
  text: string
  hits: GuardHit[]
  onReason: (value: string) => void
}) {
  const boundaries = [...new Set([0, text.length, ...hits.flatMap((h) => [h.start, h.end])])]
    .filter((n) => n >= 0 && n <= text.length)
    .sort((a, b) => a - b)
  return (
    <>
      {boundaries.slice(0, -1).map((start, i) => {
        const end = boundaries[i + 1]!,
          value = text.slice(start, end),
          active = hits.filter((h) => h.start <= start && h.end >= end)
        if (!active.length) return <span key={start}>{value}</span>
        const reason = [
          ...new Set(
            active.map(
              (h) => `${REASONS[h.reason]}${h.reason === 'llm_flagged' ? `：${h.evidence}` : ''}`,
            ),
          ),
        ].join('；')
        return (
          <button
            type="button"
            key={start}
            className={styles.hit}
            title={reason}
            aria-label={`${value}：${reason}`}
            onClick={() => onReason(`${value}：${reason}`)}
          >
            <mark>{value}</mark>
          </button>
        )
      })}
    </>
  )
}

export default function Checker() {
  const [text, setText] = useState(''),
    [facts, setFacts] = useState(''),
    [industry, setIndustry] = useState('general')
  const [key, setKey] = useState(''),
    [judge, setJudge] = useState(false),
    [rewrite, setRewrite] = useState(false)
  const [result, setResult] = useState<GuardResponse | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false),
    [reason, setReason] = useState('')
  const pending = useRef<AbortController | null>(null),
    resultTitle = useRef<HTMLHeadingElement>(null)
  useEffect(() => () => pending.current?.abort(), [])
  function invalidate() {
    pending.current?.abort()
    pending.current = null
    setLoading(false)
    setResult(null)
    setError('')
    setReason('')
  }
  async function submit(event?: FormEvent, sample?: (typeof EXAMPLES)[number]) {
    event?.preventDefault()
    pending.current?.abort()
    const controller = new AbortController()
    pending.current = controller
    setLoading(true)
    setError('')
    setResult(null)
    setReason('')
    try {
      const response = await fetch('/api/guard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(key.trim() ? { Authorization: `Bearer ${key.trim()}` } : {}),
        },
        body: JSON.stringify({
          text: sample?.text ?? text,
          facts: (sample?.facts ?? facts)
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
          industry,
          mode: judge ? 'rules+judge' : 'rules',
          rewrite: judge && rewrite,
        }),
        signal: controller.signal,
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message ?? '检查失败，请稍后重试')
      if (pending.current !== controller) return
      setResult(body as GuardResponse)
      requestAnimationFrame(() => resultTitle.current?.focus())
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '网络暂时不可用，请重试')
    } finally {
      if (pending.current === controller) {
        pending.current = null
        setLoading(false)
      }
    }
  }
  return (
    <main className={styles.checker}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          实招 <span>Shizhao</span>
        </Link>
        <span className={styles.tagline}>AI 只改颜值，不改事实。</span>
      </header>
      <div className={styles.intro}>
        <h1>营销文案检查</h1>
        <p>把文案与商品信息放在一起，逐句查看需要核实的说法。</p>
      </div>
      <div className={styles.workspace}>
        <form onSubmit={submit} className={styles.form} aria-label="文案检查表单">
          <div className={styles.examples}>
            <span>试一个示例</span>
            {EXAMPLES.map((example) => (
              <button
                type="button"
                key={example.name}
                onClick={() => {
                  invalidate()
                  setText(example.text)
                  setFacts(example.facts)
                  void submit(undefined, example)
                }}
              >
                {example.name}
              </button>
            ))}
          </div>
          <div className={styles.labelRow}>
            <label htmlFor="copy-text">营销文案</label>
            <span id="text-count">{text.length} / 5000</span>
          </div>
          <textarea
            id="copy-text"
            value={text}
            maxLength={5000}
            required
            rows={7}
            placeholder="粘贴需要检查的营销文案……"
            aria-describedby="text-count"
            onChange={(e) => {
              invalidate()
              setText(e.target.value)
            }}
          />
          <label htmlFor="copy-facts">
            商品信息 <span className={styles.muted}>（每行一条，选填）</span>
          </label>
          <textarea
            id="copy-facts"
            value={facts}
            rows={4}
            placeholder={'例如：\n当天现烤\n6寸\n128元'}
            onChange={(e) => {
              invalidate()
              setFacts(e.target.value)
            }}
            aria-describedby="facts-help"
          />
          <p id="facts-help" className={styles.hint}>
            填写已确认的商品事实，最多 100 条，每条 100 字。
          </p>
          <div className={styles.industry}>
            <label htmlFor="industry">检查行业</label>
            <select
              id="industry"
              value={industry}
              onChange={(e) => {
                invalidate()
                setIndustry(e.target.value)
              }}
            >
              <option value="general">通用规则 · 免费</option>
              <option value="food">餐饮食品 · 需 API Key</option>
            </select>
          </div>
          <details className={styles.advanced}>
            <summary>使用 API Key 与模型检查</summary>
            <label htmlFor="guard-key">API Key</label>
            <input
              id="guard-key"
              type="password"
              autoComplete="off"
              value={key}
              placeholder="仅在本页本次使用"
              onChange={(e) => {
                invalidate()
                setKey(e.target.value)
              }}
            />
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={judge}
                onChange={(e) => {
                  invalidate()
                  setJudge(e.target.checked)
                }}
              />
              启用模型判定（需 API Key）
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={rewrite}
                disabled={!judge}
                onChange={(e) => {
                  invalidate()
                  setRewrite(e.target.checked)
                }}
              />
              提供改写建议
            </label>
            <p className={styles.hint}>
              模型检查会将文案与商品信息发送给已配置的模型服务。本站不保存输入或浏览器中的密钥。
            </p>
          </details>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <button className={styles.submit} type="submit" disabled={loading || !text.trim()}>
            {loading ? '正在检查…' : '开始检查'}
            <span aria-hidden="true">→</span>
          </button>
          <p className={styles.privacy}>本站不保存文案与商品信息。每次最多检查 80 句。</p>
        </form>
        <section className={styles.results} aria-busy={loading} aria-labelledby="result-title">
          <div className={styles.resultHeading}>
            <h2 id="result-title" tabIndex={-1} ref={resultTitle}>
              检查结果
            </h2>
            <span>{result ? `${result.stats.total} 句` : '逐句核验'}</span>
          </div>
          {!result && !loading && (
            <div className={styles.empty}>
              <div className={styles.emptyMark} aria-hidden="true">
                <svg width="52" height="52" viewBox="0 0 52 52">
                  <path
                    d="M13 10h22l5 5v27H13zM21 22h12M21 29h12M21 36h7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                </svg>
              </div>
              <h3>先有事实，再有好文案。</h3>
              <p>
                选择示例即可直接检查；自己的文案填入后点击「开始检查」。命中词会高亮显示，点击即可查看原因。
              </p>
            </div>
          )}
          {loading && (
            <div role="status" className={styles.loading}>
              正在逐句检查，请稍候…
              <div />
              <div />
              <div />
            </div>
          )}
          {result && (
            <>
              <p role="status" className={result.passed ? styles.success : styles.summary}>
                {result.passed
                  ? '规则与所选判定未发现问题。'
                  : `原文有 ${result.stats.blocked + result.stats.rewritten} 句需要核实。`}
                {result.stats.rewritten > 0 && ` 已提供 ${result.stats.rewritten} 条改写建议。`}
              </p>
              <ol className={styles.sentences}>
                {result.sentences.map((sentence, i) => (
                  <li key={i}>
                    <div className={styles.sentenceLabel}>
                      <span>第 {i + 1} 句</span>
                      <strong>
                        {sentence.status === 'ok'
                          ? '未发现问题'
                          : sentence.status === 'rewritten'
                            ? '改写建议'
                            : '需要核实'}
                      </strong>
                    </div>
                    <p className={styles.sentence}>
                      <Highlight text={sentence.text} hits={sentence.hits} onReason={setReason} />
                    </p>
                    {sentence.rewrite && (
                      <div className={styles.rewrite}>
                        <span>建议文案</span>
                        <p>{sentence.rewrite}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ol>
              {reason && (
                <p role="status" className={styles.reason}>
                  {reason}
                </p>
              )}
              <p className={styles.hint}>
                规则版本 {result.meta.rulesVersion} · 用时 {result.meta.latencyMs} 毫秒
              </p>
              <p className={styles.hint}>
                未命中不等于事实已经证实。改写仅经过规则复查，未进行第二次模型事实验证。
              </p>
            </>
          )}
        </section>
      </div>
      <footer className={styles.footer}>
        <h2>把检查接入你的工作流</h2>
        <p>规则层开源免费 · 模型判定与行业规则包需 API Key</p>
        <pre aria-label="curl 调用示例">
          <code>{`curl -X POST http://localhost:6690/api/guard \\\n  -H 'Content-Type: application/json' \\\n  -d '{"text":"零糖配方，全网销量第一","facts":[]}'`}</code>
        </pre>
        <p className={styles.hint}>
          调用规范见项目文档 docs/API.md；参赛版本不包含计费或密钥自助申请。
        </p>
      </footer>
    </main>
  )
}
