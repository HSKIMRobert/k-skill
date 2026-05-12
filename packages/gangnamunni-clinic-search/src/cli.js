#!/usr/bin/env node
const { searchClinics } = require("./index")

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const result = await searchClinics(args)
  console.log(JSON.stringify(result, null, 2))
}

function parseArgs(argv) {
  const options = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--query" || arg === "-q") options.query = argv[++i] || ""
    else if (arg === "--limit") options.limit = Number(argv[++i])
    else if (arg === "--help" || arg === "-h") {
      printHelp()
      process.exit(0)
    } else if (!options.query) {
      options.query = arg
    }
  }
  return options
}

function printHelp() {
  console.log(`Usage: gangnamunni-clinic-search [query] [options]\n\nOptions:\n  -q, --query <text>     Search keyword, e.g. "강남 성형외과"\n  --limit <number>       Maximum clinic results (default: 5)\n`)
}

function run() {
  return main().catch((error) => {
    console.error(error && error.stack ? error.stack : String(error))
    process.exitCode = 1
  })
}

if (require.main === module) run()

module.exports = { parseArgs, printHelp, main }
