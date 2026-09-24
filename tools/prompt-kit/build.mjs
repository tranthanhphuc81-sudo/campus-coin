#!/usr/bin/env node
// Sinh prompt files cho GitHub Copilot (.github/prompts) và lệnh cho Claude Code (.claude/commands/campus)
// từ một nguồn duy nhất: tools/prompt-kit/prompts.source.json. Đồng thời sinh .github/copilot-instructions.md từ AGENTS.md.
// Chạy: node tools/prompt-kit/build.mjs   (hoặc npm run prompts:build)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const prompts = JSON.parse(readFileSync(join(here, 'prompts.source.json'), 'utf8'));
const tiers = JSON.parse(readFileSync(join(here, 'tiers.json'), 'utf8'));

const TIER_LABEL = { '🟢': 'Rẻ/nhanh', '🔵': 'Tầm trung agentic', '🔴': 'Cao cấp/suy luận' };
const copilotDir = join(root, '.github', 'prompts');
const claudeDir = join(root, '.claude', 'commands', 'campus');

const yamlStr = (s) => JSON.stringify(s); // chuỗi YAML an toàn (dạng JSON string)

function refPath(kind, file) {
  if (kind === 'design') return `docs/design/${file}`;
  if (kind === 'srs') return `docs/srs/${file}`;
  if (kind === 'adr') return `docs/decisions/${file}`;
  if (kind === 'doc') return file;
  throw new Error(`Unknown ref kind ${kind}`);
}

function extraRefs(p) {
  const refs = [...p.refs];
  if (p.id === 'P18.4') refs.push(['doc', 'docs/ai-usage-log.md']);
  if (p.id === 'P16.4') refs.push(['doc', 'docs/security/security-audit.md']);
  return refs;
}

function tierLine(p) {
  return `> **Cấp AI: ${p.tier} ${p.tierName}** – ${p.why}`;
}

function outputRule(p) {
  if (p.adr) {
    return [
      '## Cách ghi kết quả',
      '',
      `Chỉ tạo hoặc cập nhật DUY NHẤT file \`docs/decisions/${p.adr}.md\` theo mẫu \`docs/decisions/ADR-TEMPLATE.md\`, trạng thái \`Proposed\`. KHÔNG tạo hay sửa file code nào. Đội sẽ đọc, chỉnh và đổi trạng thái sang \`Accepted\` trước khi chạy bước B.`,
    ].join('\n');
  }
  if (p.id === 'P16.3') {
    return '## Cách ghi kết quả\n\nGhi bảng kết quả vào `docs/security/security-audit.md` (tạo mới nếu chưa có). KHÔNG sửa file code nào.';
  }
  if (p.mode === 'ask') return '## Cách ghi kết quả\n\nChỉ trả lời trong khung chat. KHÔNG sửa file nào.';
  return '';
}

function adrGuard(p) {
  const adrs = p.refs.filter(([k]) => k === 'adr').map(([, f]) => f.replace('.md', ''));
  if (!adrs.length) return '';
  return `\n**Điều kiện tiên quyết:** các file ${adrs.map((a) => `\`docs/decisions/${a}.md\``).join(', ')} phải tồn tại và có trạng thái \`Accepted\`. Nếu chưa, DỪNG và nhắc người dùng chạy prompt bước A tương ứng.\n`;
}

function body(p, target) {
  let text = p.body;
  // ô nhập liệu
  text = text.replace(/\{\{INPUT:([^}]+)\}\}/g, (_, hint) =>
    target === 'copilot' ? `Đầu vào từ người dùng: \${input:userInput:${hint.replace(/^Dán /, '')}}` : `Đầu vào từ người dùng ($ARGUMENTS): ${hint.replace(/^Dán /, '')}`);
  if (p.id === 'R-3') {
    text = (target === 'copilot' ? 'Mô tả lỗi: ${input:bug:mô tả hiện tượng, kỳ vọng, thực tế, cách tái hiện, log}\n\n' : 'Mô tả lỗi ($ARGUMENTS) – nếu thiếu mục nào trong khung dưới, hỏi lại người dùng trước khi phân tích.\n\n') + text;
  }
  if (p.id === 'P18.4') text = text.replace(/^Đầu vào từ người dùng.*\n?/m, 'Đọc file docs/ai-usage-log.md.\n');
  const refs = extraRefs(p);
  const refLines = refs.map(([k, f]) => {
    const rp = refPath(k, f);
    return target === 'copilot' ? `- [${rp}](../../${rp})` : `- @${rp}`;
  });
  const notes = p.attachNotes.length ? `\nTập trung vào: ${p.attachNotes.join('; ')}.\n` : '';
  const parts = [
    `# ${p.id} – ${p.title}`,
    '',
    tierLine(p),
    '',
    'Tuân thủ toàn bộ quy tắc trong AGENTS.md (đã được nạp tự động).',
  ];
  if (refLines.length || notes) {
    parts.push('', '## Tài liệu tham chiếu (đọc trước khi làm)', '', ...refLines, notes);
  }
  parts.push(adrGuard(p), '## Nhiệm vụ', '', text, '');
  const out = outputRule(p);
  if (out) parts.push(out, '');
  parts.push('## Kết thúc', '', 'In: (1) giả định đã đặt, (2) chỗ đội cần tự kiểm tra, (3) lệnh để chạy/kiểm thử, (4) một dòng đề xuất cho docs/ai-usage-log.md.', '');
  return parts.filter((x) => x !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
}

function copilotFile(p) {
  const fm = ['---', `name: ${p.name}`, `description: ${yamlStr(`${p.tier} ${p.id} – ${p.title}`)}`, `agent: ${p.mode}`];
  const model = tiers.copilot[p.tier];
  if (model) fm.push(`model: ${yamlStr(model)}`);
  if (p.inputs.length || p.id === 'R-3') fm.push(`argument-hint: ${yamlStr(p.id === 'R-3' ? 'Mô tả lỗi, log, cách tái hiện' : p.inputs[0].replace(/^Dán /, ''))}`);
  fm.push('---', '');
  return fm.join('\n') + body(p, 'copilot');
}

function claudeFile(p) {
  const fm = ['---', `description: ${yamlStr(`${p.tier} ${p.id} – ${p.title}`)}`];
  const model = tiers.claude[p.tier];
  if (model) fm.push(`model: ${model}`);
  if (p.inputs.length || p.id === 'R-3') fm.push(`argument-hint: ${yamlStr(p.id === 'R-3' ? '<mô tả lỗi, log, cách tái hiện>' : `<${p.inputs[0].replace(/^Dán /, '')}>`)}`);
  if (p.id === 'R-1') fm.push('allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git log:*)');
  else if (p.adr || p.mode === 'ask' || p.id === 'P16.3') fm.push('allowed-tools: Read, Grep, Glob');
  fm.push('---', '');
  return fm.join('\n') + body(p, 'claude');
}

for (const dir of [copilotDir, claudeDir]) {
  if (existsSync(dir)) for (const f of readdirSync(dir)) if (f.startsWith('p') || f.startsWith('r')) rmSync(join(dir, f));
  mkdirSync(dir, { recursive: true });
}
for (const p of prompts) {
  writeFileSync(join(copilotDir, `${p.name}.prompt.md`), copilotFile(p));
  writeFileSync(join(claudeDir, `${p.name}.md`), claudeFile(p));
}

// copilot-instructions.md sinh từ AGENTS.md để hai nơi không lệch nhau
const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
mkdirSync(join(root, '.github'), { recursive: true });
writeFileSync(join(root, '.github', 'copilot-instructions.md'),
  '<!-- File sinh tự động từ AGENTS.md bởi tools/prompt-kit/build.mjs. Sửa AGENTS.md rồi chạy npm run prompts:build. -->\n\n' + agents);

console.log(`Generated ${prompts.length} Copilot prompt files -> .github/prompts/`);
console.log(`Generated ${prompts.length} Claude Code commands  -> .claude/commands/campus/`);
console.log('Generated .github/copilot-instructions.md from AGENTS.md');
