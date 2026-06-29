#!/usr/bin/env node
const { callNamingHouseTool } = require("./index");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const value = argv[index + 1];
    index += 1;
    args[name] = value;
  }
  return args;
}

function parseJson(value, label) {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function buildInput(args) {
  const input = parseJson(args["input-json"], "--input-json") || {};
  const candidate = parseJson(args["candidate-json"], "--candidate-json");
  const candidates = parseJson(args["candidates-json"], "--candidates-json");
  if (args.surname) input.surname = args.surname;
  if (args["surname-hanja"]) input.surnameHanja = args["surname-hanja"];
  if (args["birth-date"]) input.birthDate = args["birth-date"];
  if (args["birth-time"]) input.birthTime = args["birth-time"];
  if (args.calendar) input.calendar = args.calendar;
  if (args.gender) input.gender = args.gender;
  if (args["birth-city"]) input.birthCity = args["birth-city"];
  if (args["max-candidates"]) input.preferences = { ...(input.preferences || {}), maxCandidates: Number(args["max-candidates"]) };
  if (candidates) input.candidates = candidates;
  if (args["given-name"]) input.candidates = [{ givenName: args["given-name"], ...(args["hanja-name"] ? { hanjaName: args["hanja-name"] } : {}) }];
  return { input, candidate };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tool = args.tool || "recommend_names";
  const { input, candidate } = buildInput(args);
  const payload = tool === "score_name" && candidate ? { input, candidate } : input;
  const result = await callNamingHouseTool(tool, payload);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
