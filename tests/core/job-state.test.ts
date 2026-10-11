import { describe, expect, it } from 'vitest'
import {
  deriveProjectState,
  InvalidTransitionError,
  isTerminal,
  transition,
} from '@/lib/core/job-state'
import type { JobStatus } from '@/lib/core/schemas'

const job = (status: JobStatus) => ({ id: 'job1', status })

describe('transition', () => {
  it.each([
    ['queued', 'designing'],
    ['designing', 'writing'],
    ['writing', 'guarding'],
    ['guarding', 'rendering'],
    ['rendering', 'checking'],
    ['checking', 'succeeded'],
  ] as const)('allows pipeline step %s -> %s', (from, to) => {
    expect(transition(job(from), to)).toEqual({ id: 'job1', status: to })
  })

  it.each(['queued', 'designing', 'writing', 'guarding', 'rendering', 'checking'] as const)(
    'allows %s -> failed and -> timed_out',
    (from) => {
      expect(transition(job(from), 'failed').status).toBe('failed')
      expect(transition(job(from), 'timed_out').status).toBe('timed_out')
    },
  )

  it('does not mutate the input job', () => {
    const input = job('queued')
    transition(input, 'designing')
    expect(input.status).toBe('queued')
  })

  const all: JobStatus[] = [
    'queued',
    'designing',
    'writing',
    'guarding',
    'rendering',
    'checking',
    'succeeded',
    'failed',
    'timed_out',
  ]

  it.each(['succeeded', 'failed', 'timed_out'] as const)(
    'rejects every transition out of terminal state %s',
    (from) => {
      for (const to of all) {
        expect(() => transition(job(from), to)).toThrow(InvalidTransitionError)
      }
    },
  )

  it('rejects skipping stages: queued -> rendering', () => {
    expect(() => transition(job('queued'), 'rendering')).toThrow(InvalidTransitionError)
  })

  it('rejects going backwards and staying put', () => {
    expect(() => transition(job('writing'), 'designing')).toThrow(InvalidTransitionError)
    expect(() => transition(job('writing'), 'writing')).toThrow(InvalidTransitionError)
  })

  it('rejects queued -> succeeded', () => {
    expect(() => transition(job('queued'), 'succeeded')).toThrow(InvalidTransitionError)
  })
})

describe('isTerminal', () => {
  it('is true exactly for succeeded, failed, timed_out', () => {
    expect(isTerminal('succeeded')).toBe(true)
    expect(isTerminal('failed')).toBe(true)
    expect(isTerminal('timed_out')).toBe(true)
    expect(isTerminal('queued')).toBe(false)
    expect(isTerminal('checking')).toBe(false)
  })
})

describe('deriveProjectState', () => {
  it('is generating while a job is running', () => {
    expect(
      deriveProjectState({
        jobStatuses: ['succeeded', 'writing'],
        hasSucceededVersion: true,
        publishedVersionId: null,
        unpublishedAt: null,
      }),
    ).toBe('generating')
  })

  it('is previewable with a version, no running job and nothing published', () => {
    expect(
      deriveProjectState({
        jobStatuses: ['failed', 'succeeded'],
        hasSucceededVersion: true,
        publishedVersionId: null,
        unpublishedAt: null,
      }),
    ).toBe('previewable')
  })

  it('is live when a version is published and not taken down', () => {
    expect(
      deriveProjectState({
        jobStatuses: ['succeeded'],
        hasSucceededVersion: true,
        publishedVersionId: 'ver123456789',
        unpublishedAt: null,
      }),
    ).toBe('live')
  })

  it('falls back to previewable after unpublishing', () => {
    expect(
      deriveProjectState({
        jobStatuses: ['succeeded'],
        hasSucceededVersion: true,
        publishedVersionId: 'ver123456789',
        unpublishedAt: '2026-10-11T08:00:00.000Z',
      }),
    ).toBe('previewable')
  })

  it('is null for a fresh project', () => {
    expect(
      deriveProjectState({
        jobStatuses: [],
        hasSucceededVersion: false,
        publishedVersionId: null,
        unpublishedAt: null,
      }),
    ).toBeNull()
  })
})
