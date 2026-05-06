const { parseJSON } = require('./dist/index');

const SCHEMA = { text: 'string', tool_calls: [{ name: 'string', arguments: {
  path: 'string', command: 'string', content: 'string', pattern: 'string',
  timeout: 'number', workdir: 'string', src: 'string', dst: 'string',
  patch: 'string', args: 'string', program: 'string', include: 'string',
  recursive: 'string', ignore_case: 'string', context_lines: 'number',
  start_line: 'number', end_line: 'number', num_lines: 'number',
  max_depth: 'number', max_results: 'number', name_pattern: 'string',
  file_type: 'string', id: 'number', rules_json: 'string', text: 'string',
  cache_path: 'string', index: 'number', items: 'string', title: 'string'
} }] };

const tests = [
  {
    name: 'edit_file with unescaped quotes in patch (real DeepSeek failure)',
    input: '{"text": "Updating Cargo.toml to use the shim.", "tool_calls": [{"name": "edit_file", "arguments": {"path": "D:/Umbrella/lab/servo-in-browser/embedder/Cargo.toml", "patch": "--- a/Cargo.toml\\n+++ b/Cargo.toml\\n@@ -30,4 +30,4 @@\\n ring = { path = \\"../../ring-emscripten-patch\\" }\\n gaol = { path = \\"../../gaol-emscripten-patch\\" }\\n mozangle = { path = \\"../../mozangle-emscripten-patch\\" }\\n- mozjs_sys = { path = \\"../../mozjs-sys-emscripten-patch\\" }\\n+ mozjs_sys = { path = \\"../mozjs-emscripten-shim\\" }\\n"}}]}',
    expect: { path: 'D:/Umbrella/lab/servo-in-browser/embedder/Cargo.toml', patchContains: 'ring-emscripten-patch' },
    isValid: true, // this one has proper escaping — baseline
  },
  {
    name: 'edit_file with BROKEN unescaped quotes in patch (real DeepSeek failure)',
    input: `{"text": "Updating Cargo.toml to use the shim.", "tool_calls": [{"name": "edit_file", "arguments": {"path": "D:/Umbrella/lab/servo-in-browser/embedder/Cargo.toml", "patch": "--- a/Cargo.toml\\n+++ b/Cargo.toml\\n@@ -30,4 +30,4 @@\\n ring = { path = "../../ring-emscripten-patch" }\\n gaol = { path = "../../gaol-emscripten-patch" }\\n mozangle = { path = "../../mozangle-emscripten-patch" }\\n- mozjs_sys = { path = "../../mozjs-sys-emscripten-patch" }\\n+ mozjs_sys = { path = "../mozjs-emscripten-shim" }\\n"}}]}`,
    expect: { path: 'D:/Umbrella/lab/servo-in-browser/embedder/Cargo.toml', patchContains: 'ring-emscripten-patch' },
  },
  {
    name: 'write_file with BROKEN unescaped quotes in content (real DeepSeek failure)',
    input: `{"text": "Writing the corrected Cargo.toml.", "tool_calls": [{"name": "write_file", "arguments": {"path": "D:/Umbrella/lab/servo-in-browser/embedder/Cargo.toml", "content": "[package]\\nname = "servo-web-embedder"\\nversion = "0.1.0"\\nedition = "2021"\\n\\n[dependencies]\\nservo = { path = "../../servo/components/servo" }\\neuclid = "0.22"\\nurl = "2"\\n"}}]}`,
    expect: { path: 'D:/Umbrella/lab/servo-in-browser/embedder/Cargo.toml', contentContains: 'servo-web-embedder' },
  },
  {
    name: 'bash command with unescaped quotes',
    input: `{"text": "Running the build.", "tool_calls": [{"name": "bash", "arguments": {"command": "echo "hello world" && cargo build --target wasm32-unknown-emscripten", "timeout": 300}}]}`,
    expect: { commandContains: 'hello world' },
  },
  {
    name: 'read_file simple (should still work)',
    input: '{"text": "Reading the file.", "tool_calls": [{"name": "read_file", "arguments": {"path": "D:/Umbrella/lab/Cargo.toml"}}]}',
    expect: { path: 'D:/Umbrella/lab/Cargo.toml' },
    isValid: true,
  },
  {
    name: 'edit_file with HTML content containing quotes',
    input: `{"text": "Editing HTML.", "tool_calls": [{"name": "edit_file", "arguments": {"path": "/app/index.html", "patch": "--- a/index.html\\n+++ b/index.html\\n@@ -1,3 +1,3 @@\\n <html>\\n-<div class="old">text</div>\\n+<div class="new" id="main">text</div>\\n </html>"}}]}`,
    expect: { path: '/app/index.html', patchContains: 'class=' },
  },
  {
    name: 'write_file with JSON content inside content field',
    input: `{"text": "Writing config.", "tool_calls": [{"name": "write_file", "arguments": {"path": "/app/config.json", "content": "{\\n  "name": "my-app",\\n  "version": "1.0.0",\\n  "dependencies": {\\n    "lodash": "4.17.21"\\n  }\\n}"}}]}`,
    expect: { path: '/app/config.json', contentContains: 'my-app' },
  },
  {
    name: 'grep with regex pattern containing quotes',
    input: `{"text": "Searching.", "tool_calls": [{"name": "grep", "arguments": {"pattern": "class="container"", "path": "/app/src", "recursive": "true"}}]}`,
    expect: { patternContains: 'container' },
  },
  {
    name: 'multiple tool_calls with mixed breakage',
    input: `{"text": "Reading then writing.", "tool_calls": [{"name": "read_file", "arguments": {"path": "/app/src/main.rs"}}, {"name": "write_file", "arguments": {"path": "/app/src/main.rs", "content": "fn main() {\\n    println!("Hello, world!");\\n}"}}]}`,
    expect: { secondContentContains: 'Hello, world!' },
  },
  {
    name: 'text field itself has unescaped quotes',
    input: `{"text": "The function "parse_config" is broken. Let me fix it.", "tool_calls": [{"name": "read_file", "arguments": {"path": "/app/config.rs"}}]}`,
    expect: { textContains: 'parse_config', path: '/app/config.rs' },
  },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
  process.stdout.write(`\n${'='.repeat(70)}\nTEST: ${t.name}\n${'='.repeat(70)}\n`);

  // Check if JSON.parse works
  let jsonParseOk = false;
  try { JSON.parse(t.input); jsonParseOk = true; } catch {}
  console.log(`  JSON.parse: ${jsonParseOk ? 'OK' : 'FAILS'}`);

  try {
    const result = parseJSON(t.input, SCHEMA);
    if (!result || !result.allResults || result.allResults.length === 0) {
      console.log('  LLMJsonParser: NO RESULTS');
      failed++;
      continue;
    }
    const parsed = result.allResults[0].result;
    console.log('  LLMJsonParser: got result');

    let ok = true;
    const tc0 = parsed.tool_calls?.[0];
    const tc1 = parsed.tool_calls?.[1];

    if (t.expect.path) {
      const got = tc0?.arguments?.path;
      if (got !== t.expect.path) {
        console.log(`  FAIL path: expected "${t.expect.path}", got "${got}"`);
        ok = false;
      }
    }
    if (t.expect.patchContains) {
      const got = tc0?.arguments?.patch;
      if (!got || !got.includes(t.expect.patchContains)) {
        console.log(`  FAIL patch: expected to contain "${t.expect.patchContains}", got "${(got||'').substring(0,80)}..."`);
        ok = false;
      }
    }
    if (t.expect.contentContains) {
      const got = tc0?.arguments?.content;
      if (!got || !got.includes(t.expect.contentContains)) {
        console.log(`  FAIL content: expected to contain "${t.expect.contentContains}", got "${(got||'').substring(0,80)}..."`);
        ok = false;
      }
    }
    if (t.expect.commandContains) {
      const got = tc0?.arguments?.command;
      if (!got || !got.includes(t.expect.commandContains)) {
        console.log(`  FAIL command: expected to contain "${t.expect.commandContains}", got "${got}"`);
        ok = false;
      }
    }
    if (t.expect.patternContains) {
      const got = tc0?.arguments?.pattern;
      if (!got || !got.includes(t.expect.patternContains)) {
        console.log(`  FAIL pattern: expected to contain "${t.expect.patternContains}", got "${got}"`);
        ok = false;
      }
    }
    if (t.expect.secondContentContains) {
      const got = tc1?.arguments?.content;
      if (!got || !got.includes(t.expect.secondContentContains)) {
        console.log(`  FAIL second content: expected to contain "${t.expect.secondContentContains}", got "${(got||'').substring(0,80)}..."`);
        ok = false;
      }
    }
    if (t.expect.textContains) {
      const got = parsed.text;
      if (!got || !got.includes(t.expect.textContains)) {
        console.log(`  FAIL text: expected to contain "${t.expect.textContains}", got "${(got||'').substring(0,60)}..."`);
        ok = false;
      }
    }

    if (ok) {
      console.log('  PASS');
      passed++;
    } else {
      failed++;
    }
  } catch (e) {
    console.log(`  LLMJsonParser THREW: ${e.message}`);
    failed++;
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed out of ${tests.length}`);
console.log('='.repeat(70));
