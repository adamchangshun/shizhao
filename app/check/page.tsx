import type { Metadata } from 'next'
import Checker from './checker'

export const metadata: Metadata = { title: '营销文案检查 · 实招 Shizhao' }
export default function CheckPage() {
  return <Checker />
}
