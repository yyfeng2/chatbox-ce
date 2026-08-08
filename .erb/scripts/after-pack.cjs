const patchLibsql = require('./patch-libsql.cjs')
const runtimeDeps = require('./runtime-deps.cjs')
const copyRipgrep = require('./copy-ripgrep.cjs')

exports.default = async function afterPack(context) {
  await copyRipgrep.default(context)
  await patchLibsql.default(context)
  runtimeDeps.ensureUnpackedRuntimeDeps(context)
  await runtimeDeps.default(context)
}
