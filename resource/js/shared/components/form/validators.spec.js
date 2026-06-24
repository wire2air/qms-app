import { describe, it, expect } from 'vitest'
import { required, requiredWhen, email, resolveRuleMessage } from './validators.js'

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

describe('resolveRuleMessage', () => {
  it('returns a string result unchanged', () => {
    expect(resolveRuleMessage('boom', 'X')).toBe('boom')
  })

  it('invokes a function result with the label', () => {
    expect(resolveRuleMessage((label) => `${label}!`, 'X')).toBe('X!')
  })
})
