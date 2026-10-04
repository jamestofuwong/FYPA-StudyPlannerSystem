// Copilot multi-turn stress test — simulates a growing conversation to measure
// memory and performance degradation as context length increases.
//
// Usage:
//   node tests/performance/bench-copilot-stress.mjs [--url http://localhost:3000] [--turns 20]
//
// Each turn appends the assistant reply to the conversation history before
// sending the next message, growing the context window progressively.
// Watch the process memory reported each turn — a rising baseline indicates a leak.

import { performance } from 'perf_hooks'

const args   = process.argv.slice(2)
const BASE   = args.includes('--url')   ? args[args.indexOf('--url')   + 1] : 'http://localhost:3000'
const TURNS  = args.includes('--turns') ? parseInt(args[args.indexOf('--turns') + 1]) : 20

// Alternating prompts so the conversation doesn't collapse into identical context
const TURN_PROMPTS = [
  'What study planners are available?',
  'How many units does the first planner have?',
  'What is the current system status?',
  'Can you list the planners again?',
  'What is the weather like today?',   // unhandled — tests routing rejection mid-conversation
  'Which planner is best for a student starting in 2024?',
  'Tell me about the available planners.',
  'Is Ollama running?',
  'What planners contain a unit called Advanced Programming?',
  'Show me the system status again.',
]

function nextPrompt(turn) {
  return TURN_PROMPTS[turn % TURN_PROMPTS.length]
}

async function sendTurn(messages) {
  const t0 = performance.now()
  let routingMs = null
  let ttft = null
  let tokenCount = 0
  let reply = ''
  let generationStartMs = null

  const res = await fetch(`${BASE}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    for (const line of lines) {
      if (!line.trim()) continue
      let event
      try { event = JSON.parse(line) } catch { continue }

      if (event.type === 'routed') routingMs = event.ms

      if (event.type === 'token') {
        if (ttft === null) {
          ttft = performance.now() - t0
          generationStartMs = performance.now()
        }
        tokenCount++
        reply += event.content ?? ''
      }

      if (event.type === 'reply' && !reply) {
        reply = event.content ?? ''
      }
    }
  }

  const totalMs = performance.now() - t0
  const generationMs = generationStartMs ? performance.now() - generationStartMs : null
  const tokensPerSec = (generationMs && tokenCount > 0)
    ? (tokenCount / (generationMs / 1000)).toFixed(1)
    : null

  return { totalMs, routingMs, ttft, tokenCount, tokensPerSec, reply }
}

function memMb() {
  return (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)
}

function fmt(ms) {
  return ms != null ? `${Math.round(ms)}ms` : 'n/a'
}

console.log(`\nCopilot Stress Test  —  ${BASE}  —  ${TURNS} turns`)
console.log('='.repeat(72))
console.log('Turn  Prompt (truncated)              routing  ttft    total   tps   mem')
console.log('-'.repeat(72))

const history = []
const results = []

for (let turn = 0; turn < TURNS; turn++) {
  const userMsg = nextPrompt(turn)
  history.push({ role: 'user', content: userMsg })

  process.stdout.write(`  ${String(turn + 1).padStart(2)}  `)

  try {
    const r = await sendTurn([...history])
    results.push({ turn: turn + 1, ...r })

    // Append assistant reply to history for next turn
    if (r.reply) history.push({ role: 'assistant', content: r.reply })

    const label = userMsg.slice(0, 34).padEnd(34)
    console.log(
      `${label}  ${fmt(r.routingMs).padStart(7)}  ${fmt(r.ttft).padStart(6)}  ${fmt(r.totalMs).padStart(6)}  ${(r.tokensPerSec ?? 'n/a').toString().padStart(4)}  ${memMb()}MB`
    )
  } catch (err) {
    console.log(`${'[FAILED]'.padEnd(34)}  ${err.message}`)
    history.pop() // remove the failed user message so history stays consistent
  }

  // Brief pause to avoid saturating Ollama back-to-back
  await new Promise((r) => setTimeout(r, 300))
}

console.log('='.repeat(72))

if (results.length > 0) {
  const totalVals   = results.map(r => r.totalMs)
  const first5      = results.slice(0, Math.min(5, results.length)).map(r => r.totalMs)
  const last5       = results.slice(-Math.min(5, results.length)).map(r => r.totalMs)
  const avg         = (arr) => arr.reduce((s, x) => s + x, 0) / arr.length

  console.log('\nSummary:')
  console.log(`  Total turns completed : ${results.length}`)
  console.log(`  Avg total time        : ${fmt(avg(totalVals))}`)
  console.log(`  Avg first 5 turns     : ${fmt(avg(first5))}`)
  console.log(`  Avg last  5 turns     : ${fmt(avg(last5))}`)
  console.log(`  Degradation estimate  : ${((avg(last5) - avg(first5)) / avg(first5) * 100).toFixed(1)}%`)
  console.log(`  Final heap memory     : ${memMb()}MB`)
}

console.log('\nDone.\n')
