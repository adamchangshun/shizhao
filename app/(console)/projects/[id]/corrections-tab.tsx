import s from '../../shell.module.css'

/** Placeholder: customer corrections are module 15. */
export function CorrectionsTab() {
  return (
    <section className={s.card} aria-labelledby="corr-h">
      <h2 id="corr-h" className={s.h2}>
        顾客纠错
      </h2>
      <p className={s.muted}>
        顾客发现价格、电话等信息有误时，可以在宣传页上提交纠错；经你确认后才会更新页面。这项功能即将开放。
      </p>
    </section>
  )
}
