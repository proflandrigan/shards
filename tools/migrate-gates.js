#!/usr/bin/env node
// One-shot migration: convert **GATE: ...** markers to ::GATE:: ... ::ENDGATE:: fences
// Usage:
//   node tools/migrate-gates.js --dry    # print diff only
//   node tools/migrate-gates.js --apply  # edit files in place
'use strict';

const fs = require('fs');
const path = require('path');

const AGENTS_DIR = path.join(__dirname, '..', 'src', 'agents');
const DRY = process.argv.includes('--dry');
const APPLY = process.argv.includes('--apply');

if (!DRY && !APPLY) {
  console.error('Usage: node migrate-gates.js --dry | --apply');
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function walkMd(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMd(p, results);
    else if (entry.name.endsWith('.md')) results.push(p);
  }
  return results;
}

function agentSlug(filePath) {
  const rel = path.relative(AGENTS_DIR, filePath);
  return rel.replace(/[/\\]/g, '-').replace(/\.md$/, '').replace(/[^A-Za-z0-9-]/g, '-').toLowerCase();
}

// Infer kind from gate body text and context
function inferKind(body, isLast, fileName, totalGates) {
  const b = body.toLowerCase();
  // Only mark as final if body explicitly mentions final/close-out, OR if
  // this is the last of multiple gates in a file (truly the project close-out)
  const isFinalByText = b.includes('final') || b.includes('close out') || b.includes('close-out');
  const isFinalByPosition = isLast && totalGates > 1;
  if (isFinalByText || isFinalByPosition) return 'final';
  if (b.includes('handoff')) return 'handoff';
  if (b.includes('execute') || b.includes(' run ') || fileName.includes('experiment')) return 'execute';
  return 'phase';
}

// Extract current phase number from surrounding context (look backwards for ## Phase N)
function inferPhase(text, gateIndex) {
  const before = text.slice(0, gateIndex);
  const m = before.match(/##\s+Phase\s+(\d+)/gi);
  if (m && m.length > 0) {
    const last = m[m.length - 1];
    const num = last.match(/\d+/);
    return num ? num[0] : '0';
  }
  return '0';
}

// ─── Main migration ───────────────────────────────────────────────────────────

// Match bold GATE blocks: **GATE: <text up to closing **>
// Can be multiline or single line
const GATE_RE = /\*\*GATE:\s*([\s\S]*?)\*\*/g;

let totalFiles = 0;
let totalGates = 0;

for (const filePath of walkMd(AGENTS_DIR)) {
  const original = fs.readFileSync(filePath, 'utf8');
  const slug = agentSlug(filePath);
  const fileName = path.basename(filePath);

  // Collect all matches first to count total gates (for isLast detection)
  const allMatches = [...original.matchAll(GATE_RE)];
  if (allMatches.length === 0) continue;

  const usedIds = {};
  let result = original;
  let offset = 0;
  let gateCounter = 0;

  for (let i = 0; i < allMatches.length; i++) {
    const m = allMatches[i];
    const gateIndex = m.index;
    const rawMatch = m[0];
    const body = m[1].trim();
    const isLast = i === allMatches.length - 1;

    const phase = inferPhase(original, gateIndex);
    const kind = inferKind(body, isLast, fileName, allMatches.length);

    // Build unique id
    let baseId = `${slug}-phase${phase}`;
    if (!usedIds[baseId]) {
      usedIds[baseId] = 1;
    } else {
      usedIds[baseId]++;
    }
    const id = usedIds[baseId] === 1 ? baseId : `${baseId}-${usedIds[baseId]}`;

    const fence = `::GATE:: id=${id} phase=${phase} kind=${kind}\n${body}\n::ENDGATE::`;

    if (DRY) {
      console.log(`\n[${path.relative(AGENTS_DIR, filePath)}] gate ${i + 1}/${allMatches.length}`);
      console.log(`  OLD: ${rawMatch.slice(0, 80)}...`);
      console.log(`  NEW: ${fence.slice(0, 120)}...`);
    }

    // Apply in-place with offset tracking
    const adjustedIndex = m.index + offset;
    result = result.slice(0, adjustedIndex) + fence + result.slice(adjustedIndex + rawMatch.length);
    offset += fence.length - rawMatch.length;
    gateCounter++;
  }

  if (APPLY && result !== original) {
    fs.writeFileSync(filePath, result, 'utf8');
    console.log(`  ✓ ${path.relative(AGENTS_DIR, filePath)} — ${gateCounter} gate(s) migrated`);
  }

  totalFiles++;
  totalGates += gateCounter;
}

console.log(`\n${DRY ? '[DRY RUN] ' : ''}Processed ${totalFiles} files, ${totalGates} gates total.`);
if (DRY) console.log('Run with --apply to apply changes.');
