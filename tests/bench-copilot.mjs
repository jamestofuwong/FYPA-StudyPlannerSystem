// Copilot benchmark — measures routing and generation times for the AI copilot.
//
// Usage:
//   node scripts/bench-copilot.mjs [--url http://localhost:3000] [--runs 5]
//
// The web app must be running at the target URL before running this script.
// Ollama must also be running with the model already loaded for accurate results
// (first run will include cold-start time — subsequent runs reflect warm times).

const args = process.argv.slice(2)
const BASE = args.includes('--url') ? args[args.indexOf('--url') + 1] : 'http://localhost:3000'
const RUNS = args.includes('--runs') ? parseInt(args[args.indexOf('--runs') + 1]) : 5

const PROMPTS = [
  {
    label: 'List planners (no portal)',
    messages: [{ role: 'user', content: 'What study planners are available?' }],
  },
  {
    label: 'System status (no portal)',
    messages: [{ role: 'user', content: 'What is the current system status?' }],
  },
  {
    label: 'Unhandled intent (routing only)',
    messages: [{ role: 'user', content: 'What is the weather like today?' }],
  },
]

async function runOnce(messages) {
  const t0 = performance.now()
  let routingMs = null
  let ttft = null
  let tokenCount = 0
  let generationStartMs = null

  const res = await fetch(`${BASE}/api/copilot/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() // keep incomplete line

    for (const line of lines) {
      if (!line.trim()) continue
      let event
      try { event = JSON.parse(line) } catch { continue }

      if (event.type === 'routed') {
        routingMs = event.ms
      }

      if (event.type === 'token') {
        if (ttft === null) {
          ttft = performance.now() - t0
          generationStartMs = performance.now()
        }
        tokenCount++
      }
    }
  }

  const totalMs = performance.now() - t0
  const generationMs = generationStartMs ? performance.now() - generationStartMs : null
  const tokensPerSec = (generationMs && tokenCount > 0)
    ? (tokenCount / (generationMs / 1000)).toFixed(1)
    : null

  return { totalMs, routingMs, ttft, tokenCount, tokensPerSec }
}

function avg(arr) {
  return arr.reduce((s, x) => s + x, 0) / arr.length
}

function fmt(ms) {
  return ms != null ? `${Math.round(ms)}ms` : 'n/a'
}

console.log(`\nCopilot Benchmark  —  ${BASE}  —  ${RUNS} runs per prompt`)
console.log('='.repeat(60))

for (const prompt of PROMPTS) {
  console.log(`\nPrompt: "${prompt.label}"`)
  const results = []

  for (let i = 0; i < RUNS; i++) {
    process.stdout.write(`  Run ${i + 1}/${RUNS}… `)
    try {
      const r = await runOnce(prompt.messages)
      results.push(r)
      console.log(
        `routing=${fmt(r.routingMs)}  ttft=${fmt(r.ttft)}  total=${fmt(r.totalMs)}  tokens=${r.tokenCount}  tps=${r.tokensPerSec ?? 'n/a'}`
      )
    } catch (err) {
      console.log(`FAILED — ${err.message}`)
    }

    // Brief pause between runs to avoid back-to-back Ollama pressure
    await new Promise((r) => setTimeout(r, 500))
  }

  if (results.length === 0) continue

  const routingVals = results.map(r => r.routingMs).filter(Boolean)
  const ttftVals    = results.map(r => r.ttft).filter(Boolean)
  const totalVals   = results.map(r => r.totalMs)
  const tpsVals     = results.map(r => r.tokensPerSec).filter(Boolean).map(Number)

  console.log('\n  Averages:')
  console.log(`    Routing time:       ${fmt(routingVals.length ? avg(routingVals) : null)}`)
  console.log(`    Time to first token: ${fmt(ttftVals.length ? avg(ttftVals) : null)}`)
  console.log(`    Total time:          ${fmt(avg(totalVals))}`)
  console.log(`    Tokens/sec:          ${tpsVals.length ? avg(tpsVals).toFixed(1) : 'n/a'}`)
}

console.log('\n' + '='.repeat(60))
console.log('Done.\n')
