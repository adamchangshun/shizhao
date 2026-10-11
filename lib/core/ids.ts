import { customAlphabet, nanoid } from 'nanoid'

export const SLUG_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
export const SLUG_LENGTH = 6
export const ID_LENGTH = 12

/** Matches ids produced by newId(); used to reject crafted ids before touching the filesystem. */
export const ID_PATTERN = /^[A-Za-z0-9_-]{12}$/
export const SLUG_PATTERN = /^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/

const slugGen = customAlphabet(SLUG_ALPHABET, SLUG_LENGTH)

export function newId(): string {
  return nanoid(ID_LENGTH)
}

export function newSlug(): string {
  return slugGen()
}

export function isValidId(value: string): boolean {
  return ID_PATTERN.test(value)
}
