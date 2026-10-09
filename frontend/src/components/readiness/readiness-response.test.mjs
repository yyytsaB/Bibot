import test from 'node:test'
import assert from 'node:assert/strict'
import { parseReadinessResponse } from './readiness-response.ts'
const ready = { isReady: true, statusLabel: 'Local AI Ready', detail: 'Warm-up completed.', model: 'qwen2.5:7b', consecutiveFailures: 0 }
test('accepts the backend ready response and preserves fields', () => assert.deepEqual(parseReadinessResponse(ready), ready))
test('accepts unavailable with backend failure count', () => { const value = { ...ready, isReady: false, statusLabel: 'Local AI Unavailable', consecutiveFailures: 2 }; assert.deepEqual(parseReadinessResponse(value), value) })
test('ready-looking strings or labels cannot grant readiness', () => { for (const value of [{ ...ready, isReady: 'true' }, { ...ready, isReady: false }, { ...ready, statusLabel: 'Local AI Unavailable' }]) assert.equal(parseReadinessResponse(value), null) })
test('rejects null, arrays, primitives and missing fields', () => { for (const value of [null, [], true, 'ready', {}, { isReady: true }, { ...ready, model: undefined }]) assert.equal(parseReadinessResponse(value), null) })
test('rejects invalid field types and invalid failure counters', () => { for (const value of [{ ...ready, detail: 7 }, { ...ready, model: null }, ...[-1, .5, NaN, Infinity, '0'].map(consecutiveFailures => ({ ...ready, consecutiveFailures }))]) assert.equal(parseReadinessResponse(value), null) })
test('allows additional backend fields without treating them as readiness evidence', () => assert.deepEqual(parseReadinessResponse({ ...ready, extra: 'ignored' }), ready))
