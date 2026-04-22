// Tiny JSON-field extractor used by smoke-test.sh.
// Reads JSON from stdin, runs a JS expression (arg) against the parsed object,
// writes the resulting value (or empty) to stdout. No newline.
//
//   echo '{"token":"abc"}' | node admin/_extract.mjs 'd => d.token'
//   echo '[{"id":1}]'      | node admin/_extract.mjs 'd => d[0].id'

const src = process.argv[2] || 'd => d';
const fn = new Function('d', `return (${src})(d);`);

let s = '';
process.stdin.on('data', (c) => { s += c; });
process.stdin.on('end', () => {
  try {
    const v = fn(JSON.parse(s));
    process.stdout.write(v == null ? '' : String(v));
  } catch {
    process.stdout.write('');
  }
});
