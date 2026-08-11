import { describe, it, expect } from 'vitest'
import {
  required,
  requiredWhen,
  email,
  minValue,
  maxLen,
  resolveRuleMessage,
} from './validators.js'

// A rule is (value) => true | string | ((label) => string).
// `true` = valid. A string = an explicit message. A function = a
// label-derived default that BaseField resolves via resolveRuleMessage(result, label).

describe('required', () => {
  it('passes for a non-empty string', () => {
    expect(required()('hello')).toBe(true)
  })

  it('fails for empty / whitespace-only strings', () => {
    expect(required()('')).not.toBe(true)
    expect(required()('   ')).not.toBe(true)
  })

  it('fails for null and undefined', () => {
    expect(required()(null)).not.toBe(true)
    expect(required()(undefined)).not.toBe(true)
  })

  it('fails for an empty array, passes for a non-empty one', () => {
    expect(required()([])).not.toBe(true)
    expect(required()(['a'])).toBe(true)
  })

  it('treats false (unchecked) as empty but 0 as present', () => {
    expect(required()(false)).not.toBe(true)
    expect(required()(0)).toBe(true)
    expect(required()(NaN)).not.toBe(true)
  })

  it('returns a label-derived default message when none is given', () => {
    const result = required()('')
    expect(resolveRuleMessage(result, 'Title')).toBe('Title is required.')
  })

  it('falls back to a generic message when the field has no label', () => {
    const result = required()('')
    expect(resolveRuleMessage(result, '')).toBe('This field is required.')
  })

  it('uses an explicit message verbatim, ignoring the label', () => {
    const result = required('Give it a title')('')
    expect(resolveRuleMessage(result, 'Title')).toBe('Give it a title')
  })
})

describe('requiredWhen', () => {
  it('passes (skips the check) when the condition is false, even if empty', () => {
    expect(requiredWhen(() => false)('')).toBe(true)
  })

  it('enforces required when the condition is true', () => {
    expect(requiredWhen(() => true)('')).not.toBe(true)
    expect(requiredWhen(() => true)('x')).toBe(true)
  })

  it('passes the explicit message through when it fires', () => {
    const result = requiredWhen(() => true, 'Pick a supplier.')('')
    expect(resolveRuleMessage(result, 'Supplier')).toBe('Pick a supplier.')
  })

  it('reuses the required default message when no message is given', () => {
    const result = requiredWhen(() => true)('')
    expect(resolveRuleMessage(result, 'Supplier')).toBe('Supplier is required.')
  })
})

describe('email', () => {
  it('passes for valid email addresses', () => {
    expect(email()('user@example.com')).toBe(true)
    expect(email()('support@yasin1.inbound.localhost')).toBe(true)
    expect(email()('a.b-c+tag@sub.domain.co')).toBe(true)
  })

  it('fails for malformed addresses', () => {
    expect(email()('not-an-email')).not.toBe(true)
    expect(email()('missing@domain')).not.toBe(true)
    expect(email()('@nolocal.com')).not.toBe(true)
    expect(email()('spaces in@email.com')).not.toBe(true)
    expect(email()('two@@at.com')).not.toBe(true)
  })

  it('passes for an empty value (let required() own emptiness)', () => {
    expect(email()('')).toBe(true)
    expect(email()('   ')).toBe(true)
    expect(email()(null)).toBe(true)
    expect(email()(undefined)).toBe(true)
  })

  it('returns a label-derived default message when none is given', () => {
    const result = email()('nope')
    expect(resolveRuleMessage(result, 'Email')).toBe('Email must be a valid email address.')
  })

  it('falls back to a generic message when the field has no label', () => {
    const result = email()('nope')
    expect(resolveRuleMessage(result, '')).toBe('Enter a valid email address.')
  })

  it('uses an explicit message verbatim, ignoring the label', () => {
    const result = email('Bad address')('nope')
    expect(resolveRuleMessage(result, 'Email')).toBe('Bad address')
  })
})

describe('minValue', () => {
  it('passes when the value is at least the minimum', () => {
    expect(minValue(1)(1)).toBe(true)
    expect(minValue(1)(5)).toBe(true)
    expect(minValue(0)(0)).toBe(true)
  })

  it('passes for numeric strings at/above the minimum', () => {
    expect(minValue(1)('1')).toBe(true)
    expect(minValue(10)('42')).toBe(true)
  })

  it('fails when the value is below the minimum', () => {
    expect(minValue(1)(0)).not.toBe(true)
    expect(minValue(5)('4')).not.toBe(true)
  })

  it('passes for an empty value (let required() own emptiness)', () => {
    expect(minValue(1)('')).toBe(true)
    expect(minValue(1)(null)).toBe(true)
    expect(minValue(1)(undefined)).toBe(true)
  })

  it('returns a label-derived default message when none is given', () => {
    const result = minValue(1)(0)
    expect(resolveRuleMessage(result, 'Months')).toBe('Months must be at least 1.')
  })

  it('falls back to a generic message when the field has no label', () => {
    const result = minValue(3)(1)
    expect(resolveRuleMessage(result, '')).toBe('Must be at least 3.')
  })

  it('uses an explicit message verbatim, ignoring the label', () => {
    const result = minValue(1, 'Too small')(0)
    expect(resolveRuleMessage(result, 'Months')).toBe('Too small')
  })
})

describe('maxLen', () => {
  it('passes at and below the limit', () => {
    expect(maxLen(10)('NY-HQ')).toBe(true)
    expect(maxLen(10)('1234567890')).toBe(true)
  })

  // The reason it exists: `sites.code` is STRING(10), so an 11th character is
  // a server-side failure the user cannot read.
  it('fails one character over the limit', () => {
    expect(maxLen(10)('12345678901')).not.toBe(true)
  })

  it('measures the trimmed value, so surrounding whitespace is not counted', () => {
    expect(maxLen(5)('  abc  ')).toBe(true)
  })

  it('passes for an empty value (let required() own emptiness)', () => {
    expect(maxLen(3)('')).toBe(true)
    expect(maxLen(3)(null)).toBe(true)
    expect(maxLen(3)(undefined)).toBe(true)
  })

  it('returns a label-derived default message when none is given', () => {
    const result = maxLen(10)('12345678901')
    expect(resolveRuleMessage(result, 'Code')).toBe('Code must be 10 characters or fewer.')
  })

  it('falls back to a generic message when the field has no label', () => {
    const result = maxLen(10)('12345678901')
    expect(resolveRuleMessage(result, '')).toBe('Must be 10 characters or fewer.')
  })

  it('uses an explicit message verbatim, ignoring the label', () => {
    const result = maxLen(10, 'Too long')('12345678901')
    expect(resolveRuleMessage(result, 'Code')).toBe('Too long')
  })
})

describe('resolveRuleMessage', () => {
  it('returns a string result unchanged', () => {
    expect(resolveRuleMessage('boom', 'X')).toBe('boom')
  })

  it('invokes a function result with the label', () => {
    expect(resolveRuleMessage((label) => `${label}!`, 'X')).toBe('X!')
  })
})
